import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * LoginDto — 用户登录请求
 *
 * 校验规则:
 *   email:    标准邮箱格式
 *   password: 非空 (不重复密码复杂度校验 — 那是注册时的规则)
 *
 * 安全考虑:
 *   密码不限制最大长度 → Bcrypt 会自动处理长密码 (最大 72 字节有效)
 *   不返回 "邮箱不存在" vs "密码错误" → 防止用户枚举攻击
 */
export class LoginDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'zhangsan@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email!: string;

  @ApiProperty({
    description: '密码',
    example: 'SecureP@ss123',
  })
  @IsString()
  @MinLength(1, { message: '请输入密码' })
  password!: string;
}
