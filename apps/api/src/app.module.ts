import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { configLoad } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { ATSModule } from './modules/ats/ats.module';
import { OptimizerModule } from './modules/optimizer/optimizer.module';
import { HealthModule } from './modules/health/health.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AnalysisModule } from './modules/analysis/analysis.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

/**
 * AppModule — 应用的根模块
 *
 * 架构设计:
 *   1. 全局配置: ConfigModule.forRoot() 加载所有配置命名空间
 *   2. 全局模块: PrismaModule (@Global), RedisModule (@Global)
 *   3. 全局拦截器: APP_GUARD (JWT 认证)、APP_FILTER (异常处理)、APP_INTERCEPTOR (日志)
 *      使用 APP_* 令牌注册的提供者是全局生效的，无需在每个模块重复导入
 *   4. 中间件: cookie-parser (解析 Cookie)、helmet (安全头)
 *   5. 功能模块: AuthModule、UsersModule (后续: ResumesModule, JobsModule...)
 *
 * 全局提供者执行顺序:
 *   中间件 → Guard → Interceptor (PRE) → Pipe → Controller → Interceptor (POST) → Filter
 */
@Module({
  imports: [
    // === 配置 (必须最先加载) ===
    ConfigModule.forRoot({
      isGlobal: true,
      load: configLoad,
      envFilePath: ['.env', '.env.local'],
      // 生产环境禁止覆盖 .env (运维通过容器环境变量注入)
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // === 基础设施 (全局模块) ===
    PrismaModule,
    RedisModule,
    StorageModule,

    // === 功能模块 ===
    AuthModule,
    UsersModule,
    ResumesModule,
    ATSModule,
    OptimizerModule,
    HealthModule,
    DashboardModule,
    JobsModule,
    AnalysisModule,
  ],
  providers: [
    // === 全局 JWT 认证守卫 ===
    // Secure by Default: 所有端点默认需要认证
    // 使用 @Public() 装饰器标记公开端点
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // === 全局异常过滤器 ===
    // 统一错误响应格式 + 异常日志记录
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },

    // === 全局请求日志拦截器 ===
    // 记录每个请求的 method、url、耗时、状态码
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * 配置全局中间件
   *
   * 中间件在 Guard 之前执行，适用于:
   *   - cookie-parser: 解析 Cookie 字符串为对象 (JwtRefreshStrategy 依赖)
   *   - helmet: 设置安全相关的 HTTP 头 (CSP, X-Frame-Options 等)
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        cookieParser(),         // req.cookies 解析
        helmet(),               // 安全 HTTP 头
      )
      .forRoutes('*');          // 应用到所有路由
  }
}
