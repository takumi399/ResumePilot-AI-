import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * StorageModule — 全局 S3 兼容对象存储模块
 *
 * @Global() — 全应用共享一个 S3Client 连接
 * 任何 Service 直接注入 StorageService 即可使用
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
