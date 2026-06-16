import { ApiProperty } from '@nestjs/swagger';

/**
 * AuthResponseDto — 认证成功后的标准响应
 *
 * 前端处理:
 *   accessToken  → 存储在内存 (Zustand store)，每次请求通过 Authorization header 发送
 *   refreshToken → 存储在 HttpOnly Cookie，JS 无法访问 (XSS 防护)
 *   expiresIn    → 前端用于计算何时刷新 token (提前 1 分钟刷新)
 *   user         → 前端更新 UI 状态 (用户名、角色等)
 */
/**
 * UserInfoDto — 公开的用户信息
 *
 * 注意: 必须定义在 AuthResponseDto 之前 (避免 ReferenceError)
 */
export class UserInfoDto {
  @ApiProperty({ description: '用户 ID', example: '018f9a2c-4b7e-7d1a-8000-a1b2c3d4e5f6' })
  id!: string;

  @ApiProperty({ description: '邮箱', example: 'zhangsan@example.com' })
  email!: string;

  @ApiProperty({ description: '显示名称', example: '张三' })
  name!: string | null;

  @ApiProperty({ description: '用户角色', example: 'JOB_SEEKER' })
  role!: string;

  @ApiProperty({ description: '账户状态', example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ description: '邮箱是否已验证', example: true })
  emailVerified!: boolean;

  @ApiProperty({ description: '是否启用 MFA', example: false })
  mfaEnabled!: boolean;

  @ApiProperty({ description: '注册时间', example: '2026-06-16T08:00:00.000Z' })
  createdAt!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT Access Token', example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ description: 'Access Token 过期时间 (秒)', example: 900 })
  expiresIn!: number;

  @ApiProperty({ description: 'Token 类型', example: 'Bearer' })
  tokenType: string = 'Bearer';

  @ApiProperty({ description: '用户基本信息' })
  user!: UserInfoDto;
}

/**
 * LogoutResponseDto — 登出响应
 */
export class LogoutResponseDto {
  @ApiProperty({ description: '操作结果', example: true })
  success!: boolean;

  @ApiProperty({ description: '提示信息', example: '已成功登出' })
  message!: string;
}

/**
 * RefreshResponseDto — Token 刷新响应
 */
export class RefreshResponseDto {
  @ApiProperty({ description: '新的 Access Token' })
  accessToken!: string;

  @ApiProperty({ description: 'Access Token 过期时间 (秒)', example: 900 })
  expiresIn!: number;

  @ApiProperty({ description: 'Token 类型', example: 'Bearer' })
  tokenType: string = 'Bearer';
}
