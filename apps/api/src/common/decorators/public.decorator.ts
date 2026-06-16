import { SetMetadata } from '@nestjs/common';

/**
 * IS_PUBLIC_KEY — 标记公开端点 (无需 JWT 验证)
 *
 * 用法:
 *   @Public()
 *   @Post('register')
 *   async register() {}  // 此端点跳过 JWT AuthGuard
 *
 * 原理:
 *   JwtAuthGuard 检查路由的 IS_PUBLIC_KEY 元数据
 *   如果为 true → 跳过认证 → 允许未登录访问
 *
 * NestJS 最佳实践: 默认所有端点需要认证，显式标记公开端点
 * 这比 Express 的 "默认公开 + 手动保护" 更安全
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
