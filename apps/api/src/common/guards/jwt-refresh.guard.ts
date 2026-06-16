import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtRefreshGuard — Refresh Token 认证守卫
 *
 * 用途:
 *   仅用于 /auth/refresh 端点 — 验证 Refresh Token 并签发新的 Token 对
 *
 * 与 JwtAuthGuard 的区别:
 *   1. 使用 'jwt-refresh' 策略 → JwtRefreshStrategy (Cookie 提取 + DB 验证)
 *   2. 不使用 @Public() 检查 → 此端点始终需要 Refresh Token
 *   3. 错误信息区分: 刷新失败通常是 Token 过期或被撤销
 *
 * 使用方式:
 *   @UseGuards(JwtRefreshGuard)
 *   @Post('refresh')
 *   async refresh(@CurrentUser() user: RefreshTokenPayload) {}
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  constructor() {
    super();
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    info: Error | null,
  ): TUser {
    if (err || !user) {
      const message =
        info?.message === 'jwt expired'
          ? '登录已过期，请重新登录'
          : 'Refresh Token 无效，请重新登录';

      throw new UnauthorizedException(message);
    }

    return user;
  }
}
