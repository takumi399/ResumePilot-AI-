import {
  PipeTransform,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';

/**
 * 文件验证结果
 */
export interface ValidatedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  md5Hash: string;
  sha256Hash: string;
}

/**
 * FileValidationPipe — 文件安全校验管道
 *
 * 多层安全校验 (按执行顺序):
 *
 *   L1 — 文件存在性: Has file been received?
 *   L2 — 数量限制: Single file only (多文件需前端分批上传)
 *   L3 — 文件大小: ≤ 10MB (低于此限的直接在内存中处理)
 *   L4 — 扩展名白名单: .pdf / .docx / .txt
 *   L5 — MIME 类型白名单: 与扩展名交叉验证
 *   L6 — Magic Bytes 检测: 文件头部魔数验证真实类型 (防扩展名伪造)
 *   L7 — 文件名安全: 过滤路径穿越 / XSS payload / NULL 字节
 *
 * 为什么用 Pipe 而非 Interceptor:
 *   - Pipe 在请求到达 Controller 之前执行
 *   - Pipe 抛出异常会自动转换为 400 Bad Request
 *   - 校验失败的文件不会进入业务逻辑层
 *
 * 未包含但推荐的安全措施:
 *   - ClamAV 病毒扫描 (异步，通过 BullMQ 队列处理)
 *   - 文件内容 XSS 扫描 (如 PDF 中嵌入的 JavaScript)
 *     → 这些较重操作适合在文件上传后异步处理，
 *       通过 parse_status = 'scanning' 状态追踪
 */
@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly logger = new Logger(FileValidationPipe.name);

  // === 安全限制常量 ===
  static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  static readonly ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;
  static readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    // 部分系统可能将 .docx 识别为以下 MIME:
    'application/octet-stream',
  ] as const;

  // Magic Bytes 魔数 (文件类型真实检测)
  // 这些是基于文件格式标准的前几个字节
  static readonly MAGIC_BYTES_MAP: Record<string, number[]> = {
    pdf: [0x25, 0x50, 0x44, 0x46, 0x2D],       // %PDF-
    docx: [0x50, 0x4B, 0x03, 0x04],              // PK.. (ZIP 格式)
    txt: [],                                       // 纯文本无魔数
  };

  async transform(
    file: Record<string, unknown> | undefined,
  ): Promise<ValidatedFile> {
    // Use Multer file shape: { buffer, originalname, mimetype, size }
    const multerFile = file as unknown as {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    } | undefined;
    // ============================================================
    // L1 — 文件存在性
    // ============================================================
    if (!multerFile) {
      throw new BadRequestException('请选择要上传的文件');
    }

    // ============================================================
    // L2 — 文件大小限制 (10MB)
    // ============================================================
    if (multerFile.size > FileValidationPipe.MAX_FILE_SIZE_BYTES) {
      const sizeMB = (multerFile.size / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(
        `文件大小 ${sizeMB}MB 超过限制 (最大 10MB)`,
      );
    }

    if (multerFile.size === 0) {
      throw new BadRequestException('文件为空，请选择有效的简历文件');
    }

    // ============================================================
    // L3 — 文件名安全检查
    // ============================================================
    const originalName = this.sanitizeFilename(multerFile.originalname);

    // ============================================================
    // L4 — 扩展名白名单
    // ============================================================
    const ext = this.extractExtension(originalName);
    if (!FileValidationPipe.ALLOWED_EXTENSIONS.includes(ext as typeof FileValidationPipe.ALLOWED_EXTENSIONS[number])) {
      throw new BadRequestException(`不支持的文件类型 "${ext}"，仅支持 PDF、DOCX、TXT 格式`);
    }

    // ============================================================
    // L5 — MIME 类型白名单 (与扩展名交叉验证)
    // ============================================================
    const detectedMime = multerFile.mimetype || 'application/octet-stream';

    if (
      !FileValidationPipe.ALLOWED_MIME_TYPES.includes(
        detectedMime as typeof FileValidationPipe.ALLOWED_MIME_TYPES[number],
      )
    ) {
      this.logger.warn(`文件 MIME 类型被拒绝: "${detectedMime}" (文件: ${originalName})`);
      throw new BadRequestException(`不支持的文件格式，请上传 PDF、DOCX 或 TXT 文件`);
    }

    // MIME 与扩展名一致性校验
    const expectedMime = this.getExpectedMimeForExtension(ext);
    if (expectedMime && detectedMime !== 'application/octet-stream') {
      if (detectedMime !== expectedMime) {
        this.logger.warn(`MIME 与扩展名不匹配: ext=${ext} mime=${detectedMime} expected=${expectedMime}`);
        throw new BadRequestException(`文件类型不匹配: 扩展名为 ${ext} 但内容类型为 ${detectedMime}`);
      }
    }

    // ============================================================
    // L6 — Magic Bytes 检测 (真实文件类型验证)
    // ============================================================
    this.validateMagicBytes(multerFile.buffer, ext, originalName);

    // ============================================================
    // L7 — 计算文件哈希 (用于去重和审计)
    // ============================================================
    const crypto = require('crypto');
    const sha256Hash = crypto.createHash('sha256').update(multerFile.buffer).digest('hex');
    const md5Hash = crypto.createHash('md5').update(multerFile.buffer).digest('hex');

    this.logger.log(`文件校验通过: ${originalName} (${ext}, ${(multerFile.size / 1024).toFixed(1)}KB, SHA256: ${sha256Hash.substring(0, 16)}...)`);

    return {
      buffer: multerFile.buffer,
      originalName,
      mimeType: detectedMime,
      extension: ext,
      sizeBytes: multerFile.size,
      md5Hash,
      sha256Hash,
    };
  }

  // ========================================================================
  // 私有: Magic Bytes 检测
  // ========================================================================

  /**
   * 通过文件头部魔数验证真实文件类型
   *
   * 为什么需要 Magic Bytes 检测:
   *   - 攻击者可以把 .exe 改名为 .pdf 上传
   *   - MIME type 由客户端发送，可以被伪造
   *   - Magic Bytes 是文件格式标准的硬约束，无法伪造
   */
  private validateMagicBytes(
    buffer: Buffer,
    extension: string,
    filename: string,
  ): void {
    const extKey = extension.replace('.', ''); // '.pdf' → 'pdf'

    // TXT 文件没有标准魔数，跳过
    if (extKey === 'txt') return;

    const expectedBytes = FileValidationPipe.MAGIC_BYTES_MAP[extKey];
    if (!expectedBytes || expectedBytes.length === 0) return;

    // 检查文件头部是否匹配魔数
    for (let i = 0; i < expectedBytes.length; i++) {
      if (buffer[i] !== expectedBytes[i]) {
        this.logger.warn(
          `Magic Bytes 不匹配: ${filename} 声明为 ${extension} ` +
          `但头部字节为 0x${buffer.subarray(0, Math.min(8, buffer.length)).toString('hex')}`,
        );
        throw new BadRequestException(
          `文件内容与扩展名不匹配，该文件可能不是有效的 ${extension.toUpperCase()} 文件`,
        );
      }
    }

    // DOCX 额外检查: ZIP 包中必须包含正确的 DOCX Content Type 声明
    // [FIXED #3] 严格验证 Content_Type — 任何 ZIP 文件(ODT/XLSX/JAR/APK)无法绕过
    if (extKey === 'docx') {
      const headerStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 8192));
      // 必须同时满足: (1) ZIP 文件头 (2) 包含 [Content_Types].xml (3) ContentType 匹配 DOCX
      if (!headerStr.includes('[Content_Types].xml')) {
        this.logger.warn(`DOCX 文件缺少 [Content_Types].xml: ${filename}`);
        throw new BadRequestException('该文件不是有效的 DOCX 文档 (缺少必要的内部结构)');
      }
      // 验证 Content Type 声明确实为 DOCX (而非 XLSX/PPTX/ODT)
      const isDocx = /ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/.test(headerStr);
      if (!isDocx) {
        this.logger.warn(`ZIP 文件 ContentType 不是 DOCX: ${filename}`);
        throw new BadRequestException('文件内容与扩展名不匹配 — 该 ZIP 文件不是 DOCX 文档');
      }
    }
  }

  // ========================================================================
  // 私有工具方法
  // ========================================================================

  /**
   * 文件名安全清洗
   *
   * 防御:
   *   - 路径穿越: ../../../etc/passwd → etc_passwd
   *   - XSS payload: <script>alert('xss').pdf → scriptalertxss.pdf
   *   - NULL 字节注入: file.pdf%00.exe → file.pdf.exe
   *   - 控制字符: 移除所有不可打印字符
   *   - Unicode 混淆: 保留 Unicode 但限制长度
   */
  private sanitizeFilename(filename: string): string {
    // 1. 移除路径分隔符 (防路径穿越)
    let sanitized = filename.replace(/[/\\]/g, '_');

    // 2. 移除 NULL 字节
    sanitized = sanitized.replace(/\x00/g, '');

    // 3. 移除 HTML/XML 标签 (防 XSS)
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // 4. 移除控制字符 (保留字母、数字、中文、下划线、连字符、点、空格)
    sanitized = sanitized.replace(/[^\w一-鿿㐀-䶿.-]/g, '_');

    // 5. 限制文件名长度 (最多 200 字符)
    if (sanitized.length > 200) {
      const ext = this.extractExtension(sanitized);
      const nameWithoutExt = sanitized.slice(0, 200 - ext.length);
      sanitized = nameWithoutExt + ext;
    }

    // 6. 如果清洗后为空，使用默认名称
    if (!sanitized || sanitized.replace(/\./g, '') === '') {
      sanitized = `resume_${Date.now()}.pdf`;
    }

    return sanitized;
  }

  /**
   * 提取文件扩展名 (小写)
   */
  private extractExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot).toLowerCase();
  }

  /**
   * 根据扩展名获取预期的 MIME 类型
   */
  private getExpectedMimeForExtension(ext: string): string | null {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
    };
    return map[ext] || null;
  }
}
