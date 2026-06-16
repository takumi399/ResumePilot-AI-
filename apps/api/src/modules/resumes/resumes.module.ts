import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { FileValidationPipe } from './pipes/file-validation.pipe';

/**
 * ResumesModule — 简历管理模块
 *
 * 为什么使用 MulterModule.register():
 *   - Multer 是 Express 的事实标准文件上传中间件
 *   - 全局注册 memoryStorage (文件存于内存 Buffer)
 *   - 10MB 以下的文件在内存中安全处理，无需临时文件
 *
 * 为什么用 memoryStorage 而非 diskStorage:
 *   1. 安全: 不上传到磁盘，防止临时文件残留
 *   2. 速度: 内存操作远快于磁盘 I/O
 *   3. 原子性: Buffer 可直接传给 S3 SDK，无需先读文件再上传
 *   4. 容器友好: 无状态容器无需持久化卷
 *
 * 限制:
 *   - 单文件最大 11MB (hard limit，超出直接拒绝)
 *   - 并发上传受 Node.js 内存限制 (建议配合 BullMQ 异步处理大文件)
 */
@Module({
  imports: [
    MulterModule.register({
      storage: undefined, // memory storage
      limits: {
        fileSize: 11 * 1024 * 1024,
      },
    }),
  ],
  controllers: [ResumesController],
  providers: [ResumesService, FileValidationPipe],
  exports: [ResumesService],
})
export class ResumesModule {}
