import { Global, Module, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * RedisModule — 全局 Redis 模块
 *
 * [FIXED #11] 生产环境 Redis 连接失败时立即退出 (Fail Fast)
 * 这比静默降级更安全 — 认证/会话功能依赖 Redis
 */
const redisFactory = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService): Redis => {
    const logger = new Logger('RedisModule');
    const isProduction = configService.get<string>('app.nodeEnv') === 'production';

    const client = new Redis(configService.get<string>('redis.url')!, {
      password: configService.get<string>('redis.password') || undefined,
      db: configService.get<number>('redis.db') || 0,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 2000);
        if (times > 5 && isProduction) {
          logger.error('Redis 连接失败超过 5 次，应用无法正常运行');
          process.exit(1); // [FIXED] 生产环境 Fail Fast — K8s 自动重启
        }
        logger.warn(`Redis 连接重试 #${times}，${delay}ms 后重试...`);
        return delay;
      },
      lazyConnect: false, // [FIXED] 启动时立即连接，不延迟
      enableReadyCheck: true,
      connectTimeout: 10000, // [FIXED] 10 秒超时
      commandTimeout: 5000,  // [FIXED] 命令超时 5 秒
    });

    client.on('connect', () => logger.log('Redis 已连接'));
    client.on('ready', () => logger.log('Redis 就绪'));
    client.on('error', (err) => {
      logger.error('Redis 连接错误', err.stack);
      if (isProduction) {
        process.exit(1); // [FIXED] Fail Fast
      }
    });
    client.on('close', () => logger.warn('Redis 连接关闭'));

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [redisFactory],
  exports: [redisFactory],
})
export class RedisModule {}
