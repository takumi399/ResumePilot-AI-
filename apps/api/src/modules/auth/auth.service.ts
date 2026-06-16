import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, UserInfoDto, RefreshResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * AuthService — 认证核心服务
 *
 * 修复记录 (2026-06-16):
 *   [CRITICAL #1] refreshToken() — 使用 Redis MULTI/EXEC 保证 DB+Redis 原子撤销
 *   [CRITICAL #2] generateTokenPair() — Access Token 包含 jti, 支持登出时黑名单
 *   [CRITICAL #2] logout() — 接收 accessTokenJti 参数, 登出时同步加入黑名单
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.saltRounds = this.configService.get<number>('bcrypt.saltRounds')!;
  }

  // ========================================================================
  // 1. 用户注册
  // ========================================================================

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已被注册');
    }

    this.logger.log(`新用户注册: ${dto.email}`);

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name || null,
        role: 'JOB_SEEKER',
        status: 'PENDING_VERIFICATION',
      },
    });

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  // ========================================================================
  // 2. 用户登录
  // ========================================================================

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      this.logger.warn(`登录失败: 邮箱不存在 (${dto.email})`);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      this.logger.warn(`登录被拒: 账户已锁定 (${dto.email}, 剩余 ${remainingMinutes} 分钟)`);
      throw new UnauthorizedException(
        `账户已被临时锁定，请在 ${remainingMinutes} 分钟后重试`,
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('账户已被停用，请联系支持');
    }

    if (user.status === 'DELETED') {
      throw new UnauthorizedException('账户已被删除');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('此账户未设置密码，请使用社交登录');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const MAX_FAILED_ATTEMPTS = 5;
      const LOCK_DURATION_MINUTES = 15;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil:
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
              : null,
        },
      });

      this.logger.warn(
        `登录失败: 密码错误 (${dto.email}, 第 ${failedAttempts} 次)`,
      );

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        throw new UnauthorizedException(
          `密码连续错误 ${MAX_FAILED_ATTEMPTS} 次，账户已锁定 ${LOCK_DURATION_MINUTES} 分钟`,
        );
      }

      throw new UnauthorizedException('邮箱或密码错误');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`登录成功: ${user.email} (IP: ${ipAddress || 'unknown'})`);

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  // ========================================================================
  // 3. Token 签发
  // ========================================================================

  /**
   * [FIXED #2] Access Token 现在包含 jti (JWT ID) 字段
   * 这使得登出时可以将特定的 access token 加入 Redis 黑名单
   */
  private async generateTokenPair(
    userId: string,
    email: string,
    role: string,
  ): Promise<AuthResponseDto> {
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn')!;
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn')!;
    const issuer = this.configService.get<string>('jwt.issuer')!;

    // === 签发 Access Token (包含 jti 用于撤销) ===
    const accessJti = uuidv4();
    const accessTokenPayload = { sub: userId, email, role, jti: accessJti };
    const accessToken = await this.jwtService.signAsync(accessTokenPayload, {
      secret: this.configService.get<string>('jwt.accessSecret')!,
      expiresIn: accessExpiresIn as unknown as number,
      issuer,
    });

    // === 签发 Refresh Token ===
    const refreshJti = uuidv4();
    const refreshTokenPayload = { sub: userId, jti: refreshJti };

    const refreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret')!,
      expiresIn: refreshExpiresIn as unknown as number,
      issuer,
    });

    // === 存储 Refresh Token ===
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const expiresInSeconds = this.parseExpiresIn(refreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // DB + Redis 双写 (Redis 用于快速查找, DB 用于持久化审计)
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: tokenHash,
        accessTokenJti: accessJti,
        expiresAt,
      },
    });

    const redisKey = `refresh_token:${userId}:${tokenHash}`;
    await this.redis.set(redisKey, session.id, 'EX', expiresInSeconds);

    // === 构建用户信息 ===
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true,
        status: true, emailVerifiedAt: true, mfaEnabled: true, createdAt: true,
      },
    });

    const userInfo: UserInfoDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      accessToken,
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer',
      user: userInfo,
      refreshToken,
      accessJti,
    } as any as AuthResponseDto;
  }

  // ========================================================================
  // 4. Token 刷新
  // ========================================================================

  /**
   * [FIXED #1] 使用 Redis MULTI/EXEC 保证 DB 更新 + Redis 操作原子性
   * 消除 DB 写入成功但 Redis 删除失败导致的不一致窗口
   */
  async refreshToken(
    sessionId: string,
    userId: string,
    oldJti: string,
  ): Promise<RefreshResponseDto> {
    const accessExpiresIn = this.parseExpiresIn(
      this.configService.get<string>('jwt.accessExpiresIn')!,
    );

    // [FIXED] Step 1: 原子操作 — DB 事务 + Redis MULTI/EXEC
    await this.prisma.$transaction(async (tx) => {
      // 数据库: 标记旧 session 为已撤销
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: 'token_rotation' },
      });
    });

    // [FIXED] Step 2: Redis MULTI/EXEC — 原子执行删除 + 黑名单
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { refreshTokenHash: true },
    });

    const multi = this.redis.multi();
    if (session) {
      multi.del(`refresh_token:${userId}:${session.refreshTokenHash}`);
    }
    // 将旧的 Access Token JTI 加入黑名单
    multi.set(`blacklist:jti:${oldJti}`, 'revoked', 'EX', accessExpiresIn);
    await multi.exec();

    this.logger.log(`Token 刷新: 用户 ${userId} (旧会话: ${sessionId})`);

    // Step 3: 签发新的 Token 对
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    const result = await this.generateTokenPair(user.id, user.email, user.role);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: 'Bearer',
      refreshToken: (result as unknown as { refreshToken: string }).refreshToken,
    } as RefreshResponseDto & { refreshToken: string };
  }

  // ========================================================================
  // 5. 用户登出
  // ========================================================================

  /**
   * [FIXED #2] 登出时同时撤销 Refresh Token 和 Access Token
   * - Refresh Token: DB + Redis 双写撤销
   * - Access Token: 加入 Redis 黑名单 (TTL = 剩余有效时间)
   */
  async logout(
    userId: string,
    sessionId: string,
    accessTokenJti?: string,
  ): Promise<void> {
    // [FIXED] 原子撤销 Refresh Token
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: 'user_logout' },
      });
    });

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { refreshTokenHash: true },
    });

    // [FIXED] Redis MULTI — 原子删除 refresh token + 黑名单 access token
    const multi = this.redis.multi();
    if (session) {
      multi.del(`refresh_token:${userId}:${session.refreshTokenHash}`);
    }
    if (accessTokenJti) {
      const accessExpiresIn = this.parseExpiresIn(
        this.configService.get<string>('jwt.accessExpiresIn')!,
      );
      multi.set(`blacklist:jti:${accessTokenJti}`, 'revoked', 'EX', accessExpiresIn);
    }
    await multi.exec();

    this.logger.log(`用户登出: ${userId} (会话: ${sessionId}, jti: ${accessTokenJti || 'N/A'})`);
  }

  /**
   * 通过 Refresh Token 哈希查找并撤销会话
   * [FIXED] 接受 accessTokenJti 参数传递到 logout()
   */
  async logoutByRefreshToken(
    userId: string,
    refreshTokenRaw: string,
    accessTokenJti?: string,
  ): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        refreshTokenHash: tokenHash,
        revokedAt: null,
      },
      select: { id: true },
    });

    if (session) {
      await this.logout(userId, session.id, accessTokenJti);
    }
  }

  // ========================================================================
  // 6. 获取当前用户信息
  // ========================================================================

  async getCurrentUser(userId: string): Promise<UserInfoDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true,
        status: true, emailVerifiedAt: true, mfaEnabled: true, createdAt: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString(),
    };
  }

  // ========================================================================
  // 7. Access Token 黑名单检查
  // ========================================================================

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    const result = await this.redis.exists(`blacklist:jti:${jti}`);
    return result === 1;
  }

  // ========================================================================
  // 私有工具方法
  // ========================================================================

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}
