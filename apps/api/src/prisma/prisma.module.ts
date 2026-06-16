import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — 全局数据库模块
 *
 * @Global() 装饰器使得 PrismaService 在整个应用中无需在每个模块单独导入
 * 任何 Service 直接注入 PrismaService 即可使用
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
