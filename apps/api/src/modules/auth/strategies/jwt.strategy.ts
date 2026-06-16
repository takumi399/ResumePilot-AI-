import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

/**
 * JWT Payload 结构
 *
 * [FIXED #2] 新增 jti 字段 — 支持 Access Token 黑名单撤销
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** JWT ID — 用于黑名单检查和登出撤销 */
  jti?: string;
}

/**
 * JwtStrategy — Access Token 验证策略
 *
 * [FIXED #2] 新增黑名单检查:
 *   validate() 在通过用户状态检查后，额外检查 token 的 jti 是否在 Redis 黑名单中
 *   如果 jti 已入黑名单 → 401 Unauthorized → 用户需重新登录
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
      issuer: configService.get<string>('jwt.issuer'),
    });

    this.logger.log('JWT Strategy 已初始化 (含黑名单检查)');
  }

  /**
   * [FIXED #2] 新增两步验证:
   *   1. 用户状态验证 (原有)
   *   2. Token 黑名单检查 (新增)
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Step 1: 用户状态验证
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
      this.logger.warn(`JWT 验证失败: 用户不存在 (sub=${payload.sub})`);
      throw new UnauthorizedException('用户不存在');
    }

    if (user.status === 'SUSPENDED') {
      this.logger.warn(`JWT 验证失败: 用户已被停用 (sub=${payload.sub})`);
      throw new UnauthorizedException('账户已被停用');
    }

    if (user.status === 'DELETED') {
      this.logger.warn(`JWT 验证失败: 用户已被删除 (sub=${payload.sub})`);
      throw new UnauthorizedException('账户已被删除');
    }

    // [FIXED #2] Step 2: 黑名单检查
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(`blacklist:jti:${payload.jti}`);
      if (isBlacklisted) {
        this.logger.warn(
          `JWT 验证失败: Access Token 已被撤销 (sub=${payload.sub}, jti=${payload.jti})`,
        );
        throw new UnauthorizedException('登录已失效，请重新登录');
      }
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: payload.jti,
    };
  }
}
