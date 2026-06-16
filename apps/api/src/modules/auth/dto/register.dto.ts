import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

/**
 * RegisterDto — 用户注册请求
 *
 * 校验规则:
 *   email:    标准邮箱格式
 *   password: 最少8位，至少包含一个大写字母、一个小写字母、一个数字
 *             (生产环境推荐更严格的密码策略)
 *   name:     可选，2-50 字符
 *
 * 为什么用 class-validator 而不是 Zod:
 *   - NestJS 官方推荐 + 与 Swagger 深度集成 (@ApiProperty)
 *   - 装饰器声明式语法更符合 NestJS 风格
 *   - ValidationPipe 自动转换 + 校验，无需手动调用
 */
export class RegisterDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'zhangsan@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email!: string;

  @ApiProperty({
    description: '密码 (至少8位，包含大小写字母和数字)',
    example: 'SecureP@ss123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: '密码至少需要 8 个字符' })
  @MaxLength(128, { message: '密码不能超过 128 个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: '密码必须包含至少一个大写字母、一个小写字母和一个数字',
  })
  password!: string;

  @ApiProperty({
    description: '显示名称',
    example: '张三',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '名称至少需要 2 个字符' })
  @MaxLength(50, { message: '名称不能超过 50 个字符' })
  name?: string;
}
