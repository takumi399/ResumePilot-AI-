import { Injectable, Logger, InternalServerErrorException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

/**
 * StorageService — S3 兼容对象存储服务
 *
 * [FIXED #4] 实现 OnModuleDestroy — 应用关闭时释放 S3Client 连接池
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  // 允许的文件 MIME 类型白名单
  static readonly ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]);

  // 文件扩展名到 MIME 类型的映射
  static readonly MIME_MAP: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
  };

  // 文件魔数 (Magic Bytes) 用于真实类型检测
  // PDF: %PDF-  |  DOCX: PK.. (ZIP) + [Content_Types].xml
  static readonly MAGIC_BYTES: Record<string, Buffer> = {
    pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  };

  constructor(configService: ConfigService) {
    this.bucket = configService.get<string>('s3.bucket') || 'resumepilot-resumes';

    this.s3Client = new S3Client({
      endpoint: configService.get<string>('s3.endpoint') || 'http://localhost:9000',
      region: configService.get<string>('s3.region') || 'us-east-1',
      credentials: {
        accessKeyId: configService.get<string>('s3.accessKey') || 'minioadmin',
        secretAccessKey: configService.get<string>('s3.secretKey') || 'minioadmin',
      },
      forcePathStyle: true, // MinIO 兼容必需
      // 开发环境允许 HTTP
      requestHandler: undefined,
    });

    this.logger.log(`StorageService 已初始化: ${this.bucket}`);
  }

  // ========================================================================
  // 文件上传
  // ========================================================================

  /**
   * 上传文件到 S3
   *
   * @param buffer 文件内容 (Buffer)
   * @param storageKey S3 对象键
   * @param mimeType 文件的 MIME 类型
   * @param metadata 自定义元数据 (用于审计)
   *
   * 为什么直接上传 Buffer 而非使用预签名 URL:
   *   - 需要在入库前完成文件安全校验 (Magic Bytes, ClamAV)
   *   - Buffer 版本保证校验→上传的原子性
   *   - 预签名 URL 方案适用于大文件 (>50MB) 或移动端直接上传场景
   */
  async upload(
    buffer: Buffer,
    storageKey: string,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<{ storageKey: string; etag: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          ...metadata,
        },
        // 开发环境跳过服务端加密; 生产环境使用 S3 默认加密策略
      });

      const result = await this.s3Client.send(command);

      this.logger.log(
        `文件上传成功: ${storageKey} (${(buffer.length / 1024).toFixed(1)} KB, ETag: ${result.ETag})`,
      );

      return {
        storageKey,
        etag: result.ETag || '',
      };
    } catch (error) {
      const errMsg = (error as Error).message || String(error);
      this.logger.error(`文件上传失败: ${storageKey} — ${errMsg}`, (error as Error).stack);
      throw new InternalServerErrorException('文件上传失败，请稍后重试');
    }
  }

  // ========================================================================
  // 文件删除
  // ========================================================================

  /**
   * 从 S3 删除文件
   * 幂等操作 — 删除不存在的文件不会报错
   */
  async delete(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });

      await this.s3Client.send(command);
      this.logger.log(`文件已删除: ${storageKey}`);
    } catch (error) {
      this.logger.error(`文件删除失败: ${storageKey}`, (error as Error).stack);
      throw new InternalServerErrorException('文件删除失败，请稍后重试');
    }
  }

  // ========================================================================
  // 预签名 URL
  // ========================================================================

  /**
   * 生成下载预签名 URL
   *
   * @param storageKey S3 对象键
   * @param expiresInSeconds URL 有效时间 (默认 1 小时)
   * @param responseFileName 浏览器下载时的文件名
   */
  async getDownloadUrl(
    storageKey: string,
    expiresInSeconds: number = 3600,
    responseFileName?: string,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentDisposition: responseFileName
          ? `attachment; filename="${encodeURIComponent(responseFileName)}"`
          : undefined,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(`生成下载 URL 失败: ${storageKey}`, (error as Error).stack);
      throw new InternalServerErrorException('生成下载链接失败');
    }
  }

  /**
   * 生成上传预签名 URL (用于客户端直传)
   *
   * 适用场景:
   *   - 大于 10MB 的文件 (绕过 API 服务器内存限制)
   *   - 移动端 App 直接上传
   *
   * 注意: 使用预签名 URL 时，文件安全校验必须在完成后由回调触发
   */
  async getUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds: number = 600, // 10分钟
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(`生成上传 URL 失败: ${storageKey}`, (error as Error).stack);
      throw new InternalServerErrorException('生成上传链接失败');
    }
  }

  // ========================================================================
  // 文件信息
  // ========================================================================

  /**
   * 检查文件是否存在
   */
  async exists(storageKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取文件元数据 (大小、MIME、最后修改时间)
   */
  async getMetadata(storageKey: string): Promise<{
    contentLength: number;
    contentType: string;
    lastModified: Date;
    etag: string;
  } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      const result = await this.s3Client.send(command);

      return {
        contentLength: result.ContentLength || 0,
        contentType: result.ContentType || 'application/octet-stream',
        lastModified: result.LastModified || new Date(),
        etag: result.ETag || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * [FIXED #4] 应用关闭时释放 S3 客户端连接池
   * 防止 K8s/Docker 环境中挂起连接导致 pod 延迟终止
   */
  async onModuleDestroy(): Promise<void> {
    this.s3Client.destroy();
    this.logger.log('S3 客户端连接池已释放');
  }
}
