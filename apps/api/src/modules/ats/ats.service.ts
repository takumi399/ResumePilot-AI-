import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleEngine } from './engine/rule-engine';
import { LLMAnalyzer } from './engine/llm-analyzer';
import { ScoreFusion } from './engine/score-fusion';
import {
  ATSScoreResult,
  ATSEngineConfig,
  StructuredResume,
  StructuredJobDescription,
} from './engine/types';

/**
 * ATSService — ATS 评分编排服务
 *
 * 三层架构编排:
 *   Layer 1 (RuleEngine)   — 确定性规则评分 (0ms 延迟)
 *   Layer 2 (LLMAnalyzer)  — LLM 语义分析 (并行, ~1-3s 延迟)
 *   Layer 3 (ScoreFusion)  — 融合 + 校准 + 建议生成
 *
 * 调用流程:
 *   1. 从数据库加载简历结构化数据 + JD 结构化数据
 *   2. Rule Engine 执行确定性评分
 *   3. LLM Analyzer 并行执行语义分析
 *   4. Score Fusion 融合结果
 *   5. 保存分析结果到数据库
 *   6. 返回完整 ATS 评分报告
 */
@Injectable()
export class ATSService {
  private readonly logger = new Logger(ATSService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngine,
    private readonly llmAnalyzer: LLMAnalyzer,
    private readonly scoreFusion: ScoreFusion,
  ) {}

  /**
   * 执行完整的 ATS 评分分析
   *
   * @param resumeId 简历 ID
   * @param jobId 岗位 JD ID
   * @param userId 当前用户 ID (权限校验)
   * @param config 可选的引擎配置覆盖
   */
  async analyze(
    resumeId: string,
    jobId: string,
    userId: string,
    config?: Partial<ATSEngineConfig>,
  ): Promise<ATSScoreResult> {
    const startTime = Date.now();
    this.logger.log(`ATS 分析开始: resume=${resumeId} job=${jobId}`);

    // ============================================================
    // 1. 加载数据
    // ============================================================
    const { resume, job } = await this.loadData(resumeId, jobId, userId);

    // ============================================================
    // 2. Layer 1: 规则引擎 (同步)
    // ============================================================
    const mergedConfig = this.mergeConfig(config);
    const ruleStart = Date.now();
    const ruleOutput = this.ruleEngine.analyze(resume, job);
    const ruleTime = Date.now() - ruleStart;
    this.logger.log(`Layer 1 规则引擎完成: ${ruleTime}ms`);

    // ============================================================
    // 3. Layer 2: LLM 分析 (异步，与规则引擎结果并行)
    // ============================================================
    const llmStart = Date.now();
    const llmOutput = await this.llmAnalyzer.analyze(resume, job, ruleOutput);
    const llmTime = Date.now() - llmStart;
    this.logger.log(`Layer 2 LLM 分析完成: ${llmTime}ms`);

    // ============================================================
    // 4. Layer 3: 评分融合
    // ============================================================
    const fusionStart = Date.now();
    const { result } = this.scoreFusion.fuse(ruleOutput, llmOutput, mergedConfig);
    const fusionTime = Date.now() - fusionStart;
    this.logger.log(`Layer 3 评分融合完成: ${fusionTime}ms`);

    // ============================================================
    // 5. 持久化分析结果
    // ============================================================
    await this.saveAnalysisResult(resumeId, jobId, userId, result);

    const totalTime = Date.now() - startTime;

    this.logger.log(
      `ATS 分析完成: 总分=${result.overallScore} 评级=${result.rating} ` +
      `规则=${ruleTime}ms LLM=${llmTime}ms 融合=${fusionTime}ms 总计=${totalTime}ms`,
    );

    return {
      ...result,
      metadata: {
        ...result.metadata,
        processingTimeMs: totalTime,
      },
    };
  }

  /**
   * 快速评分 — 仅规则引擎，跳过 LLM (用于实时预览)
   *
   * 适用场景:
   *   - 用户编辑简历过程中的实时评分
   *   - 免费套餐用户的简化评分
   */
  async quickScore(
    resume: StructuredResume,
    job: StructuredJobDescription,
  ): Promise<ATSScoreResult> {
    const ruleOutput = this.ruleEngine.analyze(resume, job);
    const emptyLLM = await this.llmAnalyzer.analyze(resume, job, ruleOutput);
    const { result } = this.scoreFusion.fuse(ruleOutput, emptyLLM);

    return result;
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  private async loadData(
    resumeId: string,
    jobId: string,
    userId: string,
  ): Promise<{
    resume: StructuredResume;
    job: StructuredJobDescription;
  }> {
    // 加载简历 (含所有权校验)
    const resumeRecord = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        userId: true,
        structuredData: true,
        parsedText: true,
      },
    });

    if (!resumeRecord || resumeRecord.userId !== userId) {
      throw new NotFoundException('简历不存在或无权访问');
    }

    if (!resumeRecord.structuredData) {
      throw new BadRequestException('简历尚未完成解析，请稍后再试');
    }

    // 加载 JD
    const jobRecord = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      title: string;
      structured_data: StructuredJobDescription;
      raw_text: string;
    }>>(
      `SELECT id, title, structured_data, raw_text FROM jobs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      jobId,
      userId,
    );

    if (!jobRecord || jobRecord.length === 0) {
      throw new NotFoundException('岗位不存在或无权访问');
    }

    return {
      resume: resumeRecord.structuredData as unknown as StructuredResume,
      job: {
        ...jobRecord[0].structured_data,
        rawText: jobRecord[0].raw_text,
      },
    };
  }

  private async saveAnalysisResult(
    resumeId: string,
    jobId: string,
    userId: string,
    result: ATSScoreResult,
  ): Promise<void> {
    // 使用原始 SQL 插入避免 Prisma 类型复杂度
    // 实际生产环境中应使用 Prisma 模型
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO analysis_results (
        id, user_id, resume_id, job_id,
        ats_score_total, score_breakdown, keyword_analysis,
        skill_gap_analysis, ai_suggestions, status,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3,
        $4, $5::jsonb, $6::jsonb,
        $7::jsonb, $8::jsonb, 'completed',
        now(), now()
      )`,
      userId,
      resumeId,
      jobId,
      result.overallScore,
      JSON.stringify(result.dimensions),
      JSON.stringify(result.keywordAnalysis),
      JSON.stringify(result.skillGaps),
      JSON.stringify(result.suggestions),
    );
  }

  private mergeConfig(overrides?: Partial<ATSEngineConfig>): ATSEngineConfig {
    if (!overrides) return ScoreFusion.DEFAULT_CONFIG;

    return {
      ...ScoreFusion.DEFAULT_CONFIG,
      ...overrides,
      weights: {
        ...ScoreFusion.DEFAULT_CONFIG.weights,
        ...overrides.weights,
      },
      fusionAlphas: {
        ...ScoreFusion.DEFAULT_CONFIG.fusionAlphas,
        ...overrides.fusionAlphas,
      },
      llm: {
        ...ScoreFusion.DEFAULT_CONFIG.llm,
        ...overrides.llm,
      },
      skillMatching: {
        ...ScoreFusion.DEFAULT_CONFIG.skillMatching,
        ...overrides.skillMatching,
      },
      thresholds: {
        ...ScoreFusion.DEFAULT_CONFIG.thresholds,
        ...overrides.thresholds,
      },
    };
  }
}
