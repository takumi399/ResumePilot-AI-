import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — 全局 JWT 认证守卫
 *
 * 设计要点:
 *   1. 扩展 Passport 的 AuthGuard('jwt') → 复用 JwtStrategy 的验证逻辑
 *   2. 检查 @Public() 装饰器 → 公开端点跳过认证
 *   3. 默认行为: 所有端点需要认证 (Secure by Default)
 *
 * 与 NestJS 内置 AuthGuard 的区别:
 *   - 认 @Public() 元数据 (SetMetadata('isPublic', true))
 *   - 后续可扩展: 速率限制检查、IP 白名单等
 *
 * 全局注册 (在 AppModule):
 *   { provide: APP_GUARD, useClass: JwtAuthGuard }
 *   这样所有 Controller 自动受保护，无需 @UseGuards()
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * 决定是否激活守卫
   *
   * @returns true → 跳过认证 (公开端点)
   * @returns false → 执行 Passport JWT 验证
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // 1. 检查 @Public() 装饰器
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),    // 方法级别
      context.getClass(),      // 类级别
    ]);

    if (isPublic) {
      // 公开端点 → 无需认证
      return true;
    }

    // 2. 执行 Passport JWT 策略验证
    return super.canActivate(context);
  }

  /**
   * 覆盖 handleRequest — 自定义认证失败时的错误信息
   *
   * Passport 默认错误信息为英文 "Unauthorized"
   * 重写以支持中文本地化 (后续可扩展为 i18n)
   */
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    info: Error | null,
  ): TUser {
    if (err || !user) {
      // info.message 可能包含:
      //   "No auth token" — 缺少 Token
      //   "jwt expired" — Token 过期
      //   "invalid signature" — 签名无效
      const message =
        info?.message === 'jwt expired'
          ? '登录已过期，请重新登录'
          : '请先登录';

      throw err || new UnauthorizedException(message);
    }

    return user;
  }
}
