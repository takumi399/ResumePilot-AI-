import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

/**
 * @CurrentUser() — 从请求中提取当前登录用户
 *
 * 用法:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: JwtPayload) {
 *     return user; // { sub, email, role }
 *   }
 *
 * 可选参数提取:
 *   @CurrentUser('sub') userId: string
 *
 * 原理:
 *   JwtAuthGuard → JwtStrategy.validate() 将 payload 附加到 request.user
 *   此装饰器从 ExecutionContext 中提取 request.user
 *
 * 为什么不用 @Req() request 然后手动取 request.user:
 *   1. 代码可读性: @CurrentUser() 比 @Req() req, req.user 更语义化
 *   2. 类型安全: 可指定泛型类型
 *   3. 可测试性: 单元测试中更容易 mock
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw new Error('CurrentUser 装饰器需要 JwtAuthGuard 保护');
    }

    return data ? (user[data] ?? user) : user;
  },
);
