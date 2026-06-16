import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * Refresh Token Payload
 * 比 Access Token payload 更轻量 — 仅包含标识信息
 */
export interface RefreshTokenPayload {
  sub: string;     // 用户 ID
  jti: string;     // JWT ID — 用于在 Redis 中进行撤销检查
}

/**
 * JwtRefreshStrategy — Refresh Token 验证策略
 *
 * 与 JwtStrategy 的关键区别:
 *   1. Token 来源: 从 HttpOnly Cookie 读取 (而非 Authorization header)
 *      → 防止 XSS 攻击读取 refresh token
 *   2. 额外验证: 检查 refresh token 在数据库中的状态
 *      → 支持令牌撤销、复用检测
 *   3. 密钥不同: 使用 JWT_REFRESH_SECRET (而非 JWT_ACCESS_SECRET)
 *      → 即使 Access Token 密钥泄露，Refresh Token 不受影响
 *
 * 令牌复用检测 (Refresh Token Rotation 安全机制):
 *   如果已撤销的 refresh token 被再次使用 → 说明令牌被盗
 *   → 立即撤销该用户的所有活跃会话 → 强制攻击者和用户重新登录
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  private readonly logger = new Logger(JwtRefreshStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // 从 HttpOnly Cookie 中提取 Refresh Token
      // 命名约定: 使用 'refresh_token' cookie 名称
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token =
            request.cookies?.['refresh_token'] ||
            request.headers['x-refresh-token'] as string; // API 客户端的回退方案

          if (!token) {
            throw new UnauthorizedException('缺少 Refresh Token');
          }
          return token;
        },
      ]),

      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret')!,
      issuer: configService.get<string>('jwt.issuer'),

      // 将原始 Request 传递给 validate() — 用于获取 token 字符串
      passReqToCallback: true,
    });

    this.logger.log('JWT Refresh Strategy 已初始化');
  }

  /**
   * 验证 Refresh Token
   *
   * @param request Express Request (passReqToCallback: true)
   * @param payload JWT Payload (sub + jti)
   *
   * 额外验证步骤 (相比 Access Token):
   *   1. 从 Cookie/Header 提取原始 token 字符串
   *   2. 计算 SHA-256 哈希
   *   3. 在数据库中查找: token_hash 匹配 + 未被撤销 + 未过期
   *   4. 如果找不到 → 可能是令牌复用攻击 → 撤销所有用户会话
   */
  async validate(
    request: Request,
    payload: RefreshTokenPayload,
  ): Promise<{ userId: string; jti: string; sessionId: string }> {
    // 提取原始 Refresh Token 字符串
    const rawToken =
      request.cookies?.['refresh_token'] ||
      request.headers['x-refresh-token'] as string;

    if (!rawToken) {
      throw new UnauthorizedException('缺少 Refresh Token');
    }

    // 计算 SHA-256 哈希 (不存储原始 Token)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 在数据库中查找活跃的会话记录
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (session) {
      // ================
      // 正常情况: Token 在数据库中且未被撤销
      // ================
      return {
        userId: payload.sub,
        jti: payload.jti,
        sessionId: session.id,
      };
    }

    // ================
    // 令牌复用检测: Token 已过期或被撤销但仍被使用
    // → 可能是攻击者使用了被窃取的 refresh token
    // → 撤销该用户的所有会话 (安全措施)
    // ================
    const wasRevoked = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash, userId: payload.sub },
    });

    if (wasRevoked?.revokedAt) {
      this.logger.error(
        `令牌复用检测! 用户 ${payload.sub} 的已撤销令牌被使用。正在撤销所有会话。`,
      );

      // 撤销所有活跃会话
      await this.prisma.session.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: 'theft_detected',
        },
      });
    }

    throw new UnauthorizedException('Refresh Token 无效或已过期');
  }
}
