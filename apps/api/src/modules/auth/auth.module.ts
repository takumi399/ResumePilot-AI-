import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

/**
 * AuthModule — 认证模块
 *
 * 职责: 用户注册、登录、Token 管理、登出
 *
 * 模块导入说明:
 *   - PassportModule: 认证中间件框架，提供 AuthGuard 基类
 *   - JwtModule.registerAsync: 异步注册 JWT 模块 (注入 ConfigService)
 *     JWT 密钥由环境变量提供，不在代码中硬编码
 *   - PrismaModule: 全局模块，无需显式导入 (已 @Global())
 *   - RedisModule: 全局模块，无需显式导入 (已 @Global())
 *
 * 提供者:
 *   - JwtStrategy: Access Token 验证策略
 *   - JwtRefreshStrategy: Refresh Token 验证策略
 *   - AuthService: 核心认证逻辑
 *
 * 导出的服务:
 *   - AuthService: 供其他模块 (如 UsersModule) 使用
 *   - JwtModule: 供其他模块签发 JWT
 *
 * NestJS 模块最佳实践:
 *   1. 模块封装 — JwtStrategy 仅在 AuthModule 内使用，不导出
 *   2. 依赖注入 — 使用 ConfigService 读取配置，而非直接访问 process.env
 *   3. 异步注册 — registerAsync 确保 ConfigModule 先加载
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: (configService.get<string>('jwt.accessExpiresIn') || '15m') as unknown as number,
          issuer: configService.get<string>('jwt.issuer') || 'resumepilot-api',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
