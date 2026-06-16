import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { ResumesService } from './resumes.service';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import {
  ResumeResponseDto,
  ResumeUploadResponseDto,
  ResumeListResponseDto,
  DeleteResumeResponseDto,
  UpdateResumeDto,
  ResumesQueryDto,
} from './dto/resume.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ResumesController — 简历管理控制器
 *
 * 端点设计:
 *   - 所有端点需要 JWT 认证 (全局 JwtAuthGuard 自动保护)
 *   - 所有操作经过所有权校验 (resume.userId === currentUserId)
 *   - 上传使用 multipart/form-data (FileInterceptor)
 *   - 列表查询支持分页 + 过滤 + 搜索
 *
 * Multer 配置:
 *   - FileInterceptor('file') — 从 'file' 字段提取单个文件
 *   - storage: memory — 文件存储在内存 (大小限制 10MB，低于限制则安全)
 *   - limits.fileSize: 11MB — 比业务限制多 1MB，用于给用户友好的错误提示
 *     实际 10MB 限制由 FileValidationPipe 执行
 */
@ApiTags('简历管理')
@ApiBearerAuth('JWT-auth')
@Controller('resumes')
export class ResumesController {
  private readonly logger = new Logger(ResumesController.name);

  constructor(
    private readonly resumesService: ResumesService,
    private readonly prisma: PrismaService,
  ) {}

  // ========================================================================
  // POST /resumes/upload
  // ========================================================================
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '上传简历',
    description: '上传 PDF、DOCX 或 TXT 格式的简历文件 (最大 10MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: '上传成功', type: ResumeUploadResponseDto })
  @ApiResponse({ status: 400, description: '文件格式不支持 / 文件过大 / 重复上传' })
  @ApiResponse({ status: 401, description: '未登录' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined, // memory storage — 文件存于 Buffer
      limits: {
        fileSize: 11 * 1024 * 1024, // 11MB hard limit (1MB buffer)
        files: 1,
      },
      fileFilter: (_req, file, callback) => {
        // 快速预检 — 在 FileValidationPipe 之前做基本过滤
        // 详细校验由 Pipe 完成
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile(FileValidationPipe) file: Parameters<ResumesService['upload']>[0],
    @CurrentUser('sub') userId: string,
    @Body('title') title?: string,
  ): Promise<ResumeUploadResponseDto> {
    return this.resumesService.upload(file, userId, title);
  }

  // ========================================================================
  // GET /resumes
  // ========================================================================
  @Get()
  @ApiOperation({
    summary: '获取简历列表',
    description: '获取当前用户的所有简历，支持分页、状态过滤和标题搜索',
  })
  @ApiQuery({ name: 'parseStatus', required: false, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW'] })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String, description: '标题模糊搜索' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '成功', type: ResumeListResponseDto })
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query() query: ResumesQueryDto,
  ): Promise<ResumeListResponseDto> {
    return this.resumesService.findAll(userId, query);
  }

  // ========================================================================
  // GET /resumes/:id
  // ========================================================================
  @Get(':id')
  @ApiOperation({ summary: '获取简历详情', description: '获取单份简历的详细信息，可选生成下载链接' })
  @ApiQuery({ name: 'download', required: false, type: Boolean, description: '是否生成下载预签名 URL' })
  @ApiResponse({ status: 200, description: '成功', type: ResumeResponseDto })
  @ApiResponse({ status: 404, description: '简历不存在' })
  @ApiResponse({ status: 403, description: '无权访问' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Query('download') includeDownload?: boolean,
  ): Promise<ResumeResponseDto> {
    return this.resumesService.findOne(id, userId, includeDownload === true);
  }

  // ========================================================================
  // PATCH /resumes/:id
  // ========================================================================
  @Patch(':id')
  @ApiOperation({ summary: '更新简历元数据', description: '修改简历标题、设为主要简历或归档' })
  @ApiResponse({ status: 200, description: '更新成功', type: ResumeResponseDto })
  @ApiResponse({ status: 404, description: '简历不存在' })
  @ApiResponse({ status: 403, description: '无权操作' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateResumeDto,
  ): Promise<ResumeResponseDto> {
    return this.resumesService.update(id, userId, dto);
  }

  // ========================================================================
  // DELETE /resumes/:id
  // ========================================================================
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除简历',
    description: '软删除简历 (30 天内可恢复)。添加 ?permanent=true 永久删除。',
  })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: '删除成功', type: DeleteResumeResponseDto })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Query('permanent') permanent?: boolean,
  ): Promise<DeleteResumeResponseDto> {
    if (permanent === true) {
      return this.resumesService.permanentRemove(id, userId);
    }
    return this.resumesService.remove(id, userId);
  }

  // ========================================================================
  // GET /resumes/:id/analysis
  // ========================================================================
  @Get(':id/analysis')
  @ApiOperation({ summary: '获取简历分析结果' })
  async getAnalysis(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.resumesService.ensureOwnership(id, userId);
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ats_score_total, score_breakdown, keyword_analysis, skill_gap_analysis, ai_suggestions, model_used, tokens_used, processing_time_ms, created_at
       FROM analysis_results WHERE resume_id = $1::uuid AND user_id = $2::uuid AND status = 'completed' ORDER BY created_at DESC LIMIT 1`, id, userId
    );
    if (!rows.length) throw new NotFoundException('暂无分析结果，请先执行分析');
    const r = rows[0];
    return {
      overallScore: Number(r.ats_score_total) || 0,
      rating: (Number(r.ats_score_total) >= 85 ? 'excellent' : Number(r.ats_score_total) >= 70 ? 'good' : Number(r.ats_score_total) >= 50 ? 'fair' : 'poor'),
      dimensions: (r.score_breakdown as Array<Record<string,unknown>>) || [],
      keywordAnalysis: r.keyword_analysis || { matched: [], missing: [] },
      skillGaps: r.skill_gap_analysis || { critical: [], moderate: [], strengths: [] },
      suggestions: r.ai_suggestions || [],
      confidence: 0.9,
      metadata: { modelUsed: r.model_used, tokensUsed: r.tokens_used, processingTimeMs: r.processing_time_ms, engineVersion: '2.0.0', timestamp: (r.created_at as Date)?.toISOString?.() || '' },
    };
  }

  // ========================================================================
  // POST /resumes/:id/analyze
  // ========================================================================
  @Post(':id/analyze')
  @ApiOperation({ summary: '执行 ATS 分析', description: '对简历和目标岗位执行评分分析' })
  async runAnalysis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('jobId') jobId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.resumesService.ensureOwnership(id, userId);
    if (!jobId) throw new NotFoundException('请提供目标岗位 ID');

    const resume = await this.prisma.$queryRawUnsafe<Array<{ id: string; parsed_text: string | null; user_id: string }>>(
      `SELECT id, parsed_text, user_id FROM resumes WHERE id = $1::uuid`, id
    );
    const job = await this.prisma.$queryRawUnsafe<Array<{ id: string; raw_text: string }>>(
      `SELECT id, raw_text FROM jobs WHERE id = $1::uuid AND user_id = $2::uuid`, jobId, userId
    );
    if (!resume.length) throw new NotFoundException('简历不存在');
    if (!job.length) throw new NotFoundException('岗位不存在');

    const resumeText = resume[0].parsed_text || '';
    const jdText = job[0].raw_text || '';

    // 调用 DeepSeek 进行评分
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
    const baseUrl = process.env.AI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.AI_MODEL || 'deepseek-chat';

    const prompt = `你是一位ATS评分专家。请根据以下简历和JD进行评分，返回JSON。

## 简历
${resumeText.slice(0, 3000)}

## JD
${jdText.slice(0, 3000)}

## 输出格式
{
  "overallScore": 0-100,
  "scoreBreakdown": {
    "keywordMatch": {"score": 0-100, "weight": 0.35},
    "semanticSimilarity": {"score": 0-100, "weight": 0.30},
    "experienceRelevance": {"score": 0-100, "weight": 0.20},
    "educationMatch": {"score": 0-100, "weight": 0.10},
    "atsFormatting": {"score": 0-100, "weight": 0.05}
  },
  "dimensions": [
    {"name": "skill_match", "label": "技能匹配度", "score": 0-100, "weight": 0.30, "breakdown": ["item1"]},
    {"name": "keyword_coverage", "label": "关键词覆盖率", "score": 0-100, "weight": 0.25, "breakdown": []},
    {"name": "experience_relevance", "label": "工作经验相关性", "score": 0-100, "weight": 0.20, "breakdown": []},
    {"name": "project_relevance", "label": "项目经历相关性", "score": 0-100, "weight": 0.10, "breakdown": []},
    {"name": "education_match", "label": "教育背景匹配", "score": 0-100, "weight": 0.10, "breakdown": []},
    {"name": "format_quality", "label": "简历格式质量", "score": 0-100, "weight": 0.05, "breakdown": []}
  ],
  "keywordAnalysis": {"matched": ["skill1"], "missing": [{"keyword": "x", "importance": "must_have", "suggestion": "..."}]},
  "skillGaps": {"critical": [], "moderate": [], "strengths": []},
  "suggestions": [{"id": "s1", "section": "work_experience", "type": "rewrite", "severity": "high", "category": "...", "explanation": "...", "impactEstimate": {"scoreBoost": 3, "dimension": "experience_relevance"}}]
}
只返回JSON，不要额外文本。`;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 8000 }),
      });
      const data = await response.json();
      // 推理模型可能把结果放在 reasoning_content 中
      let content = data.choices?.[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        content = data.choices?.[0]?.message?.reasoning_content || '';
      }
      if (!content || content.trim().length === 0) {
        this.logger.error('DeepSeek 返回空内容', JSON.stringify(data).slice(0, 500));
        throw new InternalServerErrorException('AI 返回空内容，请重试');
      }
      // 清理可能包裹的 markdown 代码块
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      const analysis = JSON.parse(content);

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO analysis_results (id, user_id, resume_id, job_id, ats_score_total, score_breakdown, keyword_analysis, skill_gap_analysis, ai_suggestions, status, model_used, tokens_used, cost_cents, processing_time_ms, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, 'completed', $9, $10, 0, 0, now(), now())`,
        userId, id, jobId, analysis.overallScore,
        JSON.stringify(analysis.dimensions || analysis.scoreBreakdown),
        JSON.stringify(analysis.keywordAnalysis || {}),
        JSON.stringify(analysis.skillGaps || {}),
        JSON.stringify(analysis.suggestions || []),
        model, data.usage?.total_tokens || 0
      );

      return { message: '分析完成', overallScore: analysis.overallScore, dimensions: analysis.dimensions };
    } catch (err) {
      this.logger.error('分析失败', (err as Error).stack);
      if (err instanceof SyntaxError) {
        throw new InternalServerErrorException('AI 返回格式异常，请重试');
      }
      throw new InternalServerErrorException('分析失败: ' + (err as Error).message);
    }
  }
}
