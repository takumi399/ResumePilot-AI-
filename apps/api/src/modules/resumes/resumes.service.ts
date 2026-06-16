import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ValidatedFile } from './pipes/file-validation.pipe';
import {
  ResumeResponseDto,
  ResumeListResponseDto,
  UpdateResumeDto,
  ResumesQueryDto,
} from './dto/resume.dto';
import { Prisma, FileType, ParseStatus } from '@prisma/client';

/**
 * ResumesService — 简历管理核心服务
 *
 * 职责:
 *   1. 文件上传 → 安全校验 → S3 存储 → 数据库记录
 *   2. 文件删除 → S3 删除 → 数据库软删除 (30 天回收站)
 *   3. 文件列表 → 分页查询 + 过滤 + 搜索
 *   4. 文件详情 → 单条查询 + 按需生成下载 URL
 *   5. 权限校验 → 用户只能操作自己的简历
 *
 * 设计原则:
 *   - 所有权校验: 所有操作验证 resume.userId === currentUserId
 *   - 软删除: deletedAt 标记而非物理删除 (GDPR 宽限期)
 *   - 去重: SHA-256 哈希检测重复上传
 *   - 存储分层: 元数据在 PostgreSQL，文件在 S3
 */
@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  // 单用户简历上限 (防滥用)
  private static readonly MAX_RESUMES_PER_USER = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ========================================================================
  // 1. 上传简历
  // ========================================================================

  /**
   * 上传简历文件
   *
   * 流程:
   *   [客户端] → FileValidationPipe (L1-L7 安全校验)
   *            → 数量限制检查
   *            → 重复文件检测 (SHA-256)
   *            → 上传到 S3 (AES-256 加密)
   *            → 写入数据库
   *            → 返回结果
   *
   * @param file 经过 FileValidationPipe 校验的安全文件对象
   * @param userId 当前用户 ID (来自 JWT)
   * @param title 简历标题 (可选，默认使用文件名)
   */
  async upload(
    file: ValidatedFile,
    userId: string,
    title?: string,
  ): Promise<{ resume: ResumeResponseDto; message: string }> {
    // ==========================================================
    // 检查用户简历数量上限
    // ==========================================================
    const currentCount = await this.prisma.resume.count({
      where: { userId, deletedAt: null },
    });

    if (currentCount >= ResumesService.MAX_RESUMES_PER_USER) {
      throw new BadRequestException(
        `简历数量已达上限 (${ResumesService.MAX_RESUMES_PER_USER} 份)，请删除不需要的简历后重试`,
      );
    }

    // ==========================================================
    // 重复文件检测 (SHA-256 哈希)
    // ==========================================================
    const existingResume = await this.prisma.resume.findFirst({
      where: {
        userId,
        fileHash: file.sha256Hash,
        deletedAt: null,
      },
      select: { id: true, title: true },
    });

    if (existingResume) {
      this.logger.warn(`重复上传: ${file.originalName}, 已有简历: ${existingResume.id}`);
      // 如果旧简历没有文本内容，直接删掉它（允许重新上传）
      await this.prisma.resume.deleteMany({
        where: { id: existingResume.id, parsedText: null },
      });
      if (!(await this.prisma.resume.findUnique({ where: { id: existingResume.id } }))) {
        this.logger.log(`已自动清理旧的无文本简历，允许重新上传`);
      } else {
        throw new BadRequestException(`您已上传过相同的文件，请勿重复上传`);
      }
    }

    // ==========================================================
    // 文件类型映射
    // ==========================================================
    const fileType = this.mapExtensionToFileType(file.extension);

    // ==========================================================
    // 生成 S3 存储键
    // 格式: resumes/{userId}/{uuid}_{sanitizedFilename}
    // 使用 crypto.randomUUID() 保证唯一性，同时文件名保留可读性
    // ==========================================================
    const fileUuid = crypto.randomUUID();
    const storageKey = `resumes/${userId}/${fileUuid}_${file.originalName}`;

    // ==========================================================
    // 上传到 S3
    // ==========================================================
    await this.storage.upload(file.buffer, storageKey, file.mimeType, {
      'user-id': userId,
      'file-hash': file.sha256Hash,
      'original-name': file.originalName,
    });

    // ==========================================================
    // 写入数据库
    // ==========================================================
    const resumeTitle = title || file.originalName.replace(/\.[^.]+$/, '');

    // 对于 TXT 文件直接提取文本内容
    const parsedText = file.extension === '.txt' ? file.buffer.toString('utf-8') : null;

    const resume = await this.prisma.resume.create({
      data: {
        userId,
        title: resumeTitle,
        originalFileName: file.originalName,
        originalFileType: fileType,
        fileSizeBytes: BigInt(file.sizeBytes),
        storageKey,
        mimeType: file.mimeType,
        fileHash: file.sha256Hash,
        fileHashAlgo: 'sha256',
        parsedText,
        parseStatus: parsedText ? 'COMPLETED' : 'PENDING',
        isPrimary: currentCount === 0,
      },
    });

    this.logger.log(
      `简历上传成功: ${resume.id} (用户: ${userId}, 文件: ${file.originalName}, ${(file.sizeBytes / 1024).toFixed(1)}KB)`,
    );

    return {
      resume: this.toResponseDto(resume),
      message: '简历上传成功',
    };
  }

  // ========================================================================
  // 2. 获取简历列表
  // ========================================================================

  /**
   * 获取当前用户的简历列表 (分页 + 过滤 + 搜索)
   */
  async findAll(userId: string, query: ResumesQueryDto): Promise<ResumeListResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20)); // 限制 1-50
    const skip = (page - 1) * limit;

    // 构建 Prisma 查询条件
    const where: Prisma.ResumeWhereInput = {
      userId,
      deletedAt: null,
    };

    // 归档过滤 (默认不显示归档)
    if (!query.includeArchived) {
      where.isArchived = false;
    }

    // 解析状态过滤
    if (query.parseStatus) {
      where.parseStatus = query.parseStatus;
    }

    // 标题模糊搜索
    if (query.search) {
      where.title = {
        contains: query.search,
        mode: 'insensitive', // 不区分大小写
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.resume.findMany({
        where,
        select: this.getResumeSelectFields(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.resume.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toResponseDto(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ========================================================================
  // 3. 获取简历详情
  // ========================================================================

  /**
   * 获取单个简历详情
   *
   * @param resumeId 简历 ID
   * @param userId 当前用户 ID (权限校验)
   * @param includeDownloadUrl 是否生成下载预签名 URL (默认 false，按需)
   */
  async findOne(
    resumeId: string,
    userId: string,
    includeDownloadUrl = false,
  ): Promise<ResumeResponseDto> {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: this.getResumeSelectFields(),
    });

    // 存在性校验
    if (!resume || resume.deletedAt) {
      throw new NotFoundException('简历不存在');
    }

    // 所有权校验 — 用户只能访问自己的简历
    if (resume.userId !== userId) {
      this.logger.warn(
        `越权访问: 用户 ${userId} 尝试访问简历 ${resumeId} (所有者: ${resume.userId})`,
      );
      throw new ForbiddenException('无权访问该简历');
    }

    const dto = this.toResponseDto(resume);

    // 按需生成下载 URL
    if (includeDownloadUrl && resume.storageKey) {
      dto.downloadUrl = await this.storage.getDownloadUrl(
        resume.storageKey,
        3600, // 1 小时有效
        resume.originalFileName,
      );
    }

    return dto;
  }

  // ========================================================================
  // 4. 更新简历元数据
  // ========================================================================

  async update(
    resumeId: string,
    userId: string,
    dto: UpdateResumeDto,
  ): Promise<ResumeResponseDto> {
    // 所有权校验
    await this.ensureOwnership(resumeId, userId);

    // 如果设置为主要简历，先取消其他主要简历标记
    if (dto.isPrimary === true) {
      await this.prisma.resume.updateMany({
        where: { userId, isPrimary: true, id: { not: resumeId } },
        data: { isPrimary: false },
      });
    }

    const resume = await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.isArchived !== undefined && { isArchived: dto.isArchived }),
      },
      select: this.getResumeSelectFields(),
    });

    return this.toResponseDto(resume);
  }

  // ========================================================================
  // 5. 删除简历
  // ========================================================================

  /**
   * 软删除简历
   *
   * 流程:
   *   1. 所有权校验
   *   2. 软删除数据库记录 (设置 deletedAt)
   *   3. 暂不删除 S3 文件 (30 天宽限期，可恢复)
   *   4. Cron Job 定期清理超过宽限期的文件
   *
   * 为什么软删除:
   *   - 用户误删可恢复 (用户体验)
   *   - GDPR 合规: 30 天后永久删除
   *   - S3 文件延迟清理: 避免误删导致数据不可恢复
   */
  async remove(resumeId: string, userId: string): Promise<{ success: boolean; message: string }> {
    await this.ensureOwnership(resumeId, userId);

    await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        deletedAt: new Date(),
        scheduledPurgeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // [FIXED #5] 30天后清理S3
      },
    });

    this.logger.log(`简历已软删除: ${resumeId} (用户: ${userId})，将在 ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()} 永久清理`);

    return {
      success: true,
      message: '简历已删除，可在 30 天内恢复',
    };
  }

  /**
   * 永久删除简历 (回收站中彻底删除)
   */
  async permanentRemove(
    resumeId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // 所有权校验 — 即使已删除也需验证所有权
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: { userId: true, storageKey: true, deletedAt: true },
    });

    if (!resume) {
      throw new NotFoundException('简历不存在');
    }

    if (resume.userId !== userId) {
      throw new ForbiddenException('无权操作该简历');
    }

    // 删除 S3 文件
    await this.storage.delete(resume.storageKey);

    // 物理删除数据库记录
    await this.prisma.resume.delete({ where: { id: resumeId } });

    this.logger.log(`简历已永久删除: ${resumeId}`);

    return {
      success: true,
      message: '简历已永久删除',
    };
  }

  // ========================================================================
  // 6. 定时清理过期简历 (Cron Job)
  // ========================================================================

  /**
   * [FIXED #5] 永久删除超过 30 天宽限期的简历
   *
   * 应由 BullMQ Cron Job 每天凌晨 3:00 调用
   * 清理步骤: 删除 S3 文件 → 物理删除数据库记录
   */
  async purgeExpiredResumes(): Promise<{ purged: number; errors: string[] }> {
    const now = new Date();
    const errors: string[] = [];
    let purged = 0;

    const expired = await this.prisma.resume.findMany({
      where: {
        deletedAt: { not: null },
        scheduledPurgeAt: { lt: now },
      },
      select: { id: true, storageKey: true },
      take: 100, // 批量处理，防止一次性删除过多
    });

    for (const resume of expired) {
      try {
        await this.storage.delete(resume.storageKey);
        await this.prisma.resume.delete({ where: { id: resume.id } });
        purged++;
        this.logger.log(`已清理过期简历: ${resume.id}`);
      } catch (err) {
        errors.push(`${resume.id}: ${(err as Error).message}`);
        this.logger.error(`清理简历失败: ${resume.id}`, (err as Error).stack);
      }
    }

    return { purged, errors };
  }

  // ========================================================================
  // 7. 权限校验
  // ========================================================================

  /**
   * 确保当前用户拥有该简历的所有权
   * @throws NotFoundException 简历不存在
   * @throws ForbiddenException 用户无权访问
   */
  async ensureOwnership(resumeId: string, userId: string): Promise<void> {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: { userId: true, deletedAt: true },
    });

    if (!resume || resume.deletedAt) {
      throw new NotFoundException('简历不存在');
    }

    if (resume.userId !== userId) {
      this.logger.warn(
        `所有权校验失败: 用户 ${userId} 尝试操作简历 ${resumeId} (所有者: ${resume.userId})`,
      );
      throw new ForbiddenException('无权操作该简历');
    }
  }

  // ========================================================================
  // 私有工具方法
  // ========================================================================

  /**
   * 将扩展名映射为 FileType 枚举
   */
  private mapExtensionToFileType(ext: string): FileType {
    switch (ext) {
      case '.pdf': return 'PDF';
      case '.docx': return 'DOCX';
      case '.txt': return 'TXT';
      default:
        throw new BadRequestException(`不支持的文件类型: ${ext}`);
    }
  }

  /**
   * Prisma 查询字段选择 (仅选择需要的字段)
   * 避免 SELECT * 导致的性能浪费
   */
  private getResumeSelectFields(): Prisma.ResumeSelect {
    return {
      id: true,
      userId: true,
      title: true,
      originalFileName: true,
      originalFileType: true,
      fileSizeBytes: true,
      storageKey: true,
      mimeType: true,
      fileHash: true,
      pageCount: true,
      parseStatus: true,
      parseError: true,
      isPrimary: true,
      isArchived: true,
      language: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };
  }

  /**
   * 将 Prisma 查询结果转换为响应 DTO
   *
   * 为什么要转换:
   *   1. 对客户端隐藏内部字段 (storageKey, fileHash, deletedAt)
   *   2. BigInt → Number 转换 (JSON.stringify 不支持 BigInt)
   *   3. 添加计算字段 (fileSizeFormatted)
   */
  private toResponseDto(data: {
    id: string;
    userId: string;
    title: string;
    originalFileName: string;
    originalFileType: FileType;
    fileSizeBytes: bigint;
    storageKey: string;
    mimeType: string;
    pageCount: number | null;
    parseStatus: ParseStatus;
    parseError: string | null;
    isPrimary: boolean;
    isArchived: boolean;
    language: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): ResumeResponseDto {
    const sizeBytes = Number(data.fileSizeBytes);

    return {
      id: data.id,
      title: data.title,
      originalFileName: data.originalFileName,
      originalFileType: data.originalFileType,
      fileSizeBytes: sizeBytes,
      fileSizeFormatted: this.formatFileSize(sizeBytes),
      mimeType: data.mimeType,
      pageCount: data.pageCount,
      parseStatus: data.parseStatus,
      parseError: data.parseError,
      isPrimary: data.isPrimary,
      isArchived: data.isArchived,
      language: data.language,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
      downloadUrl: null,
    };
  }

  /**
   * 人类可读的文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
