import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, IsBoolean } from 'class-validator';
import { FileType, ParseStatus } from '@prisma/client';

// ============================================================================
// 请求 DTOs
// ============================================================================

/**
 * UpdateResumeDto — 更新简历元数据
 *
 * 仅允许更新用户可控的字段 (title, isPrimary, isArchived)
 * 不允许修改: 文件内容、解析结果、存储键 — 这些通过专用端点处理
 */
export class UpdateResumeDto {
  @ApiPropertyOptional({
    description: '简历标题',
    example: '我的后端工程师简历 - 字节跳动版',
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过 200 个字符' })
  title?: string;

  @ApiPropertyOptional({
    description: '设为主要简历 (仪表盘默认显示)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({
    description: '归档简历 (隐藏但不删除)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

/**
 * ResumesQueryDto — 简历列表查询参数
 */
export class ResumesQueryDto {
  @ApiPropertyOptional({
    description: '按解析状态过滤',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW'],
  })
  @IsOptional()
  @IsString()
  parseStatus?: ParseStatus;

  @ApiPropertyOptional({
    description: '是否仅显示未归档的简历',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({
    description: '搜索关键词 (模糊匹配标题)',
    example: '后端工程师',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: '页码 (从1开始)',
    default: 1,
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: '每页数量',
    default: 20,
  })
  @IsOptional()
  limit?: number;
}

// ============================================================================
// 响应 DTOs
// ============================================================================

/**
 * ResumeResponseDto — 简历详情响应
 */
export class ResumeResponseDto {
  @ApiProperty({ description: '简历 ID', example: '018f9a2c-4b7e-7d1a-8000-a1b2c3d4e5f6' })
  id!: string;

  @ApiProperty({ description: '简历标题', example: '我的后端工程师简历' })
  title!: string;

  @ApiProperty({ description: '原始文件名', example: 'ZhangSan_Resume_2026.pdf' })
  originalFileName!: string;

  @ApiProperty({ enum: ['PDF', 'DOCX', 'TXT'], description: '文件类型' })
  originalFileType!: FileType;

  @ApiProperty({ description: '文件大小 (字节)', example: 245760 })
  fileSizeBytes!: number;

  @ApiProperty({ description: '文件大小 (人类可读)', example: '240 KB' })
  fileSizeFormatted!: string;

  @ApiProperty({ description: 'MIME 类型', example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ description: '页数', example: 2, nullable: true })
  pageCount!: number | null;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW'], description: '解析状态' })
  parseStatus!: ParseStatus;

  @ApiProperty({ description: '解析错误信息', nullable: true })
  parseError!: string | null;

  @ApiProperty({ description: '是否为主要简历' })
  isPrimary!: boolean;

  @ApiProperty({ description: '是否已归档' })
  isArchived!: boolean;

  @ApiProperty({ description: '语言', example: 'zh' })
  language!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;

  @ApiProperty({ description: '下载预签名 URL (可选，按需生成)', nullable: true })
  downloadUrl!: string | null;
}

/**
 * ResumeUploadResponseDto — 上传成功响应
 */
export class ResumeUploadResponseDto {
  @ApiProperty({ description: '上传结果' })
  resume!: ResumeResponseDto;

  @ApiProperty({ description: '提示信息', example: '简历上传成功，正在解析中...' })
  message!: string;
}

/**
 * ResumeListResponseDto — 简历列表响应
 */
export class ResumeListResponseDto {
  @ApiProperty({ description: '简历列表', type: [ResumeResponseDto] })
  items!: ResumeResponseDto[];

  @ApiProperty({ description: '总数', example: 15 })
  total!: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page!: number;

  @ApiProperty({ description: '每页数量', example: 20 })
  limit!: number;

  @ApiProperty({ description: '总页数', example: 1 })
  totalPages!: number;
}

/**
 * DeleteResumeResponseDto — 删除响应
 */
export class DeleteResumeResponseDto {
  @ApiProperty({ description: '操作结果', example: true })
  success!: boolean;

  @ApiProperty({ description: '提示信息', example: '简历已删除' })
  message!: string;
}
