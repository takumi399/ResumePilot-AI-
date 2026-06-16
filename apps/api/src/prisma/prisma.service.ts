import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — 全局数据库连接服务
 *
 * 设计要点:
 *   1. 继承 PrismaClient 而非包装它 — 直接暴露所有 Prisma 方法，零抽象开销
 *   2. OnModuleInit → $connect() — NestJS 模块初始化时建立数据库连接
 *   3. OnModuleDestroy → $disconnect() — 应用关闭时优雅断开连接
 *   4. enableShutdownHooks — 在 beforeExit 事件中关闭连接 (容器化环境必需)
 *   5. 单例 — @Injectable() 默认 singleton scope，全局共享一个连接池
 *
 * 使用方式 (任何 Service):
 *   constructor(private readonly prisma: PrismaService) {}
 *   const user = await this.prisma.user.findUnique({ where: { id } });
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // 生产环境日志: 只记录 error 和 warn
    // 开发环境日志: 记录所有查询 (debug 模式)
    super({
      log:
        process.env.NODE_ENV === 'production'
          ? [{ level: 'error', emit: 'stdout' }, { level: 'warn', emit: 'stdout' }]
          : [{ level: 'query', emit: 'event' }],
    });

    // 开发环境下监听查询日志 (方便调试慢查询)
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (e: { query: string; params: string; duration: number }) => {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('正在连接 PostgreSQL...');
    await this.$connect();
    this.logger.log('PostgreSQL 连接已建立');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('正在断开 PostgreSQL 连接...');
    await this.$disconnect();
    this.logger.log('PostgreSQL 连接已关闭');
  }
}
