import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstrap — NestJS 应用入口
 *
 * 启动流程:
 *   1. 创建 NestFactory 实例 (Express 平台)
 *   2. 启用 CORS (允许前端跨域)
 *   3. 注册全局 ValidationPipe (自动校验 DTO)
 *   4. 配置 Swagger/OpenAPI 文档
 *   5. 设置全局 API 前缀 (/api/v1)
 *   6. 启动 HTTP 服务器
 *
 * Graceful Shutdown:
 *   enableShutdownHooks() 监听 SIGTERM/SIGINT 信号
 *   在 K8s/Docker 环境中正确关闭连接
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ====================================================================
  // CORS 配置
  // ====================================================================
  const allowedOrigins = configService.get<string>('app.nodeEnv') !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003']
    : [configService.get<string>('app.frontendUrl') || 'https://resumepilot.ai'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // ====================================================================
  // 全局 ValidationPipe
  // ====================================================================
  // 自动校验所有 @Body() / @Query() / @Param() 装饰的 DTO
  //
  // 配置说明:
  //   whitelist: true       — 自动剔除 DTO 中未定义的属性 (防 Mass Assignment)
  //   forbidNonWhitelisted: true — 包含未定义属性时抛出 400
  //   transform: true       — 自动类型转换 (字符串 "123" → 数字 123)
  //                            (依赖 class-transformer)
  //   transformOptions.enableImplicitConversion: true — 隐式类型转换
  //     (如 @Type(() => Number) 可将字符串转为数字)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ====================================================================
  // Swagger / OpenAPI 文档
  // ====================================================================
  // 仅在非生产环境启用
  if (configService.get<string>('app.nodeEnv') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ResumePilot AI API')
      .setDescription('AI 驱动的简历分析与优化平台 — REST API 文档')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '输入 JWT Access Token',
        },
        'JWT-auth',
      )
      .addCookieAuth('refresh_token', {
        type: 'apiKey',
        in: 'cookie',
        description: 'Refresh Token (HttpOnly Cookie)',
      })
      .addServer('http://localhost:3001', '本地开发环境')
      .addServer('https://api.resumepilot.ai', '生产环境')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,  // 刷新页面时保留认证状态
        tagsSorter: 'alpha',         // 按字母排序标签
        operationsSorter: 'method',  // 按 HTTP 方法排序端点
      },
    });

    logger.log('Swagger 文档已启用: http://localhost:3001/api/docs');
  }

  // ====================================================================
  // 全局 API 前缀
  // ====================================================================
  const apiPrefix = configService.get<string>('app.apiPrefix')!;
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'ready'],  // 健康检查端点不加前缀
  });

  // ====================================================================
  // Graceful Shutdown
  // ====================================================================
  app.enableShutdownHooks();

  // ====================================================================
  // 启动 HTTP 服务器
  // ====================================================================
  const port = configService.get<number>('app.port')!;
  await app.listen(port);

  logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.log(`  ResumePilot AI API 已启动`);
  logger.log(`  端口: ${port}`);
  logger.log(`  环境: ${configService.get<string>('app.nodeEnv')}`);
  logger.log(`  API:  http://localhost:${port}/${apiPrefix}`);
  logger.log(`  Swagger: http://localhost:${port}/api/docs`);
  logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

bootstrap().catch((error) => {
  console.error('应用启动失败:', error);
  process.exit(1);
});
