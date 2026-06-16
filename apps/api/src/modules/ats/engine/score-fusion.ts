import { Injectable, Logger } from '@nestjs/common';
import {
  RuleEngineOutput,
  LLMAnalysisOutput,
  ATSScoreResult,
  DimensionScore,
  ATSEngineConfig,
  ATSRating,
  MissingKeyword,
  SkillGap,
  Suggestion,
  SectionDistribution,
} from './types';

/**
 * ScoreFusion — ATS 评分第三层: 评分融合与校准
 *
 * 职责:
 *   融合规则引擎 (确定性) 和 LLM (语义) 的评分结果
 *
 * 融合策略:
 *   每个维度使用自适应融合参数 α:
 *     final_score = α × rule_score + (1-α) × llm_score
 *
 *   α 的选择取决于维度特性:
 *   ┌──────────────────────┬──────┬─────────────────────────────┐
 *   │ 维度                 │  α   │ 理由                        │
 *   ├──────────────────────┼──────┼─────────────────────────────┤
 *   │ 技能匹配             │ 0.65 │ 规则更可靠 (精确关键词)      │
 *   │ 关键词覆盖率         │ 0.50 │ 各半 (规则做精确, LLM做语义)│
 *   │ 工作经验相关性       │ 0.35 │ LLM 理解上下文更准确         │
 *   │ 项目经历相关性       │ 0.30 │ LLM 评估深度更擅长           │
 *   │ 教育背景             │ 0.75 │ 规则可靠 (学位级别匹配)      │
 *   │ 格式质量             │ 1.00 │ 纯规则 (LLM 无法分析格式)    │
 *   └──────────────────────┴──────┴─────────────────────────────┘
 *
 * 校准机制:
 *   - 置信度加权: LLM 低置信度时自动降低其权重
 *   - Must-have 惩罚: 关键技能缺失时全局降分
 *   - 上限/下限钳制: 防止极端评分
 */
@Injectable()
export class ScoreFusion {
  private readonly logger = new Logger(ScoreFusion.name);

  /** 默认引擎配置 */
  static readonly DEFAULT_CONFIG: ATSEngineConfig = {
    weights: {
      skillMatch: 0.30,
      keywordCoverage: 0.25,
      experienceRelevance: 0.20,
      projectRelevance: 0.10,
      educationMatch: 0.10,
      formatQuality: 0.05,
    },
    fusionAlphas: {
      skillMatch: 0.65,
      keywordCoverage: 0.50,
      experienceRelevance: 0.35,
      projectRelevance: 0.30,
      educationMatch: 0.75,
      formatQuality: 1.0,
    },
    llm: {
      enabled: true,
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 1000,
      enableStreaming: false,
    },
    skillMatching: {
      fuzzyThreshold: 0.75,
      synonymExpansion: true,
      contextWeight: 0.4,
    },
    thresholds: {
      excellent: 85,
      good: 70,
      fair: 50,
      poor: 30,
    },
  };

  /**
   * 主入口: 融合规则引擎 + LLM 分析结果 → 最终 ATS 评分
   */
  fuse(
    ruleOutput: RuleEngineOutput,
    llmOutput: LLMAnalysisOutput,
    config: ATSEngineConfig = ScoreFusion.DEFAULT_CONFIG,
  ): { result: ATSScoreResult; dimensions: DimensionScore[] } {
    const startTime = Date.now();

    // ============================================================
    // 阶段 1: 各维度自适应融合
    // ============================================================
    const dimensions = this.fuseDimensions(ruleOutput, llmOutput, config);

    // ============================================================
    // 阶段 2: 加权计算总分
    // ============================================================
    let overallScore = 0;
    for (const dim of dimensions) {
      overallScore += dim.weightedScore;
    }

    // ============================================================
    // 阶段 3: Must-have 缺失惩罚 (关键技能缺口)
    // ============================================================
    const mustHaveMissing = ruleOutput.skillMatch.details.mustHaveMissing;
    if (mustHaveMissing.length > 0) {
      // 每个缺失的 must-have 技能扣 3 分 (上限 15 分)
      const penalty = Math.min(15, mustHaveMissing.length * 3);
      overallScore = Math.max(0, overallScore - penalty);
      this.logger.log(`Must-have 缺失惩罚: -${penalty} (${mustHaveMissing.length} 个技能)`);
    }

    // ============================================================
    // 阶段 4: 四舍五入 + 钳制
    // ============================================================
    overallScore = Math.round(Math.max(0, Math.min(100, overallScore)));

    // ============================================================
    // 阶段 5: 评级
    // ============================================================
    const rating = this.calculateRating(overallScore, config.thresholds);

    // ============================================================
    // 阶段 6: 构建关键词分析
    // ============================================================
    const keywordAnalysis = {
      matched: [
        ...ruleOutput.skillMatch.details.mustHaveMatched,
        ...ruleOutput.skillMatch.details.preferredMatched,
      ],
      partial: ruleOutput.skillMatch.details.partialMatches,
      missing: ruleOutput.keywordCoverage.details.missingKeywords,
      densityMap: ruleOutput.keywordCoverage.details.sectionDistribution,
    };

    // ============================================================
    // 阶段 7: 技能差距分类
    // ============================================================
    const skillGaps = this.classifySkillGaps(ruleOutput, keywordAnalysis.missing);

    // ============================================================
    // 阶段 8: 生成优化建议
    // ============================================================
    const suggestions = this.generateSuggestions(ruleOutput, dimensions, skillGaps);

    // ============================================================
    // 阶段 9: 计算综合置信度
    // ============================================================
    const confidence = this.calculateOverallConfidence(dimensions, llmOutput);

    const processingTimeMs = Date.now() - startTime;

    return {
      result: {
        overallScore,
        percentile: null, // 由调用方从数据库计算
        rating,
        dimensions,
        keywordAnalysis,
        skillGaps: {
          critical: skillGaps.filter((g) => g.importance === 'must_have'),
          moderate: skillGaps.filter((g) => g.importance !== 'must_have'),
          strengths: [
            ...ruleOutput.skillMatch.details.mustHaveMatched,
            ...ruleOutput.skillMatch.details.preferredMatched,
          ],
        },
        suggestions,
        confidence,
        metadata: {
          engineVersion: '2.0.0',
          modelUsed: config.llm.enabled ? config.llm.model : 'rule-only',
          processingTimeMs,
          timestamp: new Date().toISOString(),
        },
      },
      dimensions,
    };
  }

  // ========================================================================
  // 维度融合
  // ========================================================================

  private fuseDimensions(
    rule: RuleEngineOutput,
    llm: LLMAnalysisOutput,
    config: ATSEngineConfig,
  ): DimensionScore[] {
    const { weights, fusionAlphas } = config;

    return [
      this.fuseOne(
        'skill_match', '技能匹配度', weights.skillMatch,
        rule.skillMatch.rawScore,
        llm.skillSemanticMatch.score,
        fusionAlphas.skillMatch,
        llm.skillSemanticMatch.confidenceScore,
        [
          `必备技能匹配: ${rule.skillMatch.details.mustHaveMatched.length}/${rule.skillMatch.details.mustHaveMatched.length + rule.skillMatch.details.mustHaveMissing.length}`,
          `优先技能匹配: ${rule.skillMatch.details.preferredMatched.length}/${rule.skillMatch.details.preferredMatched.length + rule.skillMatch.details.preferredMissing.length}`,
          `模糊匹配: ${rule.skillMatch.details.partialMatches.length} 项`,
          rule.skillMatch.details.mustHaveMissing.length > 0
            ? `⚠️ 缺失 ${rule.skillMatch.details.mustHaveMissing.length} 个必备技能`
            : '✅ 所有必备技能已覆盖',
        ],
      ),
      this.fuseOne(
        'keyword_coverage', '关键词覆盖率', weights.keywordCoverage,
        rule.keywordCoverage.rawScore,
        60, // LLM 不直接评估关键词覆盖率
        fusionAlphas.keywordCoverage,
        0.5,
        [
          `关键词匹配: ${rule.keywordCoverage.details.matchedKeywords}/${rule.keywordCoverage.details.totalKeywords}`,
          `行为动词密度: ${Math.round(rule.formatQuality.details.actionVerbDensity)}%`,
          `可量化成就: ${rule.experienceRelevance.details.quantifiedAchievements} 项`,
        ],
      ),
      this.fuseOne(
        'experience_relevance', '工作经验相关性', weights.experienceRelevance,
        rule.experienceRelevance.rawScore,
        llm.experienceDepth.score,
        fusionAlphas.experienceRelevance,
        llm.experienceDepth.confidenceScore,
        [
          `总工作年限: ${rule.experienceRelevance.details.totalYears} 年`,
          `职位相似度: ${Math.round(rule.experienceRelevance.details.titleSimilarity)}%`,
          `STAR 法则符合率: ${Math.round(rule.experienceRelevance.details.starComplianceRate)}%`,
          `LLM 影响级别: ${llm.experienceDepth.impactLevel}`,
        ],
      ),
      this.fuseOne(
        'project_relevance', '项目经历相关性', weights.projectRelevance,
        rule.projectRelevance.rawScore,
        llm.projectDepth.score,
        fusionAlphas.projectRelevance,
        llm.projectDepth.confidenceScore,
        [
          `相关项目: ${rule.projectRelevance.details.relevantProjects}/${rule.projectRelevance.details.totalProjects}`,
          `技术栈重叠: ${Math.round(rule.projectRelevance.details.techStackOverlap)}%`,
          `LLM 技术深度: ${Math.round(llm.projectDepth.technicalDepth)}%`,
        ],
      ),
      this.fuseOne(
        'education_match', '教育背景匹配', weights.educationMatch,
        rule.educationMatch.rawScore,
        60, // LLM 不参与教育评分
        fusionAlphas.educationMatch,
        1.0,
        [
          `最高学历: ${rule.educationMatch.details.highestDegree}`,
          rule.educationMatch.details.levelMatch ? '✅ 学历达标' : '⚠️ 学历未达要求',
          `专业相关度: ${Math.round(rule.educationMatch.details.majorRelevance)}%`,
        ],
      ),
      this.fuseOne(
        'format_quality', '简历格式质量', weights.formatQuality,
        rule.formatQuality.rawScore,
        0, // LLM 不参与
        fusionAlphas.formatQuality,
        1.0,
        this.buildFormatBreakdown(rule),
      ),
    ];
  }

  private fuseOne(
    name: string,
    label: string,
    weight: number,
    ruleScore: number,
    llmScore: number,
    alpha: number,
    llmConfidence: number,
    breakdown: string[],
  ): DimensionScore {
    // 自适应 α: LLM 置信度低 → 增加规则引擎权重
    const adjustedAlpha = Math.min(1, alpha + (1 - alpha) * (1 - llmConfidence));

    // 当 LLM 分数为 0 时 (如格式质量)，纯规则评分
    const finalLLMScore = llmScore === 0 ? null : llmScore;

    let fusedScore: number;
    if (finalLLMScore === null) {
      fusedScore = ruleScore;
    } else {
      fusedScore = adjustedAlpha * ruleScore + (1 - adjustedAlpha) * finalLLMScore;
    }

    fusedScore = Math.round(Math.max(0, Math.min(100, fusedScore)));
    const weightedScore = Math.round(fusedScore * weight * 100) / 100;

    return {
      name,
      label,
      score: fusedScore,
      weight,
      weightedScore,
      ruleScore,
      llmScore: finalLLMScore,
      fusionAlpha: Math.round(adjustedAlpha * 100) / 100,
      confidence: finalLLMScore !== null ? llmConfidence : 1.0,
      breakdown,
    };
  }

  // ========================================================================
  // 帮助方法
  // ========================================================================

  private calculateRating(
    score: number,
    thresholds: ATSEngineConfig['thresholds'],
  ): ATSRating {
    if (score >= thresholds.excellent) return 'excellent';
    if (score >= thresholds.good) return 'good';
    if (score >= thresholds.fair) return 'fair';
    if (score >= thresholds.poor) return 'poor';
    return 'fail';
  }

  private classifySkillGaps(
    rule: RuleEngineOutput,
    missingKeywords: MissingKeyword[],
  ): SkillGap[] {
    const gaps: SkillGap[] = [];

    for (const missing of missingKeywords) {
      gaps.push({
        skill: missing.keyword,
        importance: missing.importance,
        currentLevel: 'none',
        requiredLevel: missing.importance === 'must_have' ? 'advanced' : 'intermediate',
        suggestion: missing.suggestion,
      });
    }

    return gaps;
  }

  private generateSuggestions(
    rule: RuleEngineOutput,
    dimensions: DimensionScore[],
    skillGaps: SkillGap[],
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];
    let id = 0;

    // 1. 基于技能差距的建议
    for (const gap of skillGaps) {
      suggestions.push({
        id: `sg-${++id}`,
        section: 'skills',
        type: 'add_keyword',
        severity: gap.importance === 'must_have' ? 'critical' : 'high',
        category: `缺失技能: ${gap.skill}`,
        explanation: gap.suggestion,
        impactEstimate: {
          scoreBoost: gap.importance === 'must_have' ? 5 : 2,
          dimension: 'skill_match',
        },
      });
    }

    // 2. 基于 STAR 法则的建议
    if (rule.experienceRelevance.details.starComplianceRate < 50) {
      suggestions.push({
        id: `sg-${++id}`,
        section: 'work_experience',
        type: 'quantify',
        severity: 'high',
        category: 'STAR 法则优化',
        explanation:
          '建议使用 STAR 法则重写经历要点: Situation → Task → Action → Result。每条要点以强行为动词开头，并用具体数字量化成果。',
        impactEstimate: { scoreBoost: 8, dimension: 'experience_relevance' },
      });
    }

    // 3. 基于格式的建议
    if (rule.formatQuality.details.usesTablesOrColumns) {
      suggestions.push({
        id: `sg-${++id}`,
        section: 'format',
        type: 'formatting',
        severity: 'critical',
        category: 'ATS 解析兼容性',
        explanation:
          '检测到表格或多栏布局，这会导致 ATS 系统解析时丢失内容。请使用单栏布局重新排版。',
        impactEstimate: { scoreBoost: 15, dimension: 'format_quality' },
      });
    }

    // 4. 基于关键词分布的建议
    const dist = rule.keywordCoverage.details.sectionDistribution;
    if (dist.experience < 0.3) {
      suggestions.push({
        id: `sg-${++id}`,
        section: 'work_experience',
        type: 'add_keyword',
        severity: 'medium',
        category: '关键词分布优化',
        explanation:
          '关键词在工作经历部分分布不足。建议在经历描述中自然融入更多行业术语，而非仅在技能部分列举。',
        impactEstimate: { scoreBoost: 4, dimension: 'keyword_coverage' },
      });
    }

    // 5. 基于低分维度的建议
    const lowDims = dimensions
      .filter((d) => d.score < 50)
      .sort((a, b) => a.score - b.score);

    for (const dim of lowDims.slice(0, 3)) {
      suggestions.push({
        id: `sg-${++id}`,
        section: dim.name,
        type: 'rewrite',
        severity: dim.score < 30 ? 'critical' : 'high',
        category: `${dim.label} 需要改进`,
        explanation: `该维度得分较低 (${dim.score}/100)。${this.getDimensionImprovementAdvice(dim.name)}`,
        impactEstimate: {
          scoreBoost: Math.round((70 - dim.score) * dim.weight * 0.5),
          dimension: dim.name,
        },
      });
    }

    return suggestions;
  }

  private getDimensionImprovementAdvice(name: string): string {
    switch (name) {
      case 'skill_match':
        return '建议: 获取缺失的关键技能认证，或在项目经历中补充相关技术实践。';
      case 'keyword_coverage':
        return '建议: 对照 JD 加入更多行业标准术语，特别是在工作经历描述中。';
      case 'experience_relevance':
        return '建议: 突出与目标岗位最相关的经验，量化成果，使用行业特定术语。';
      case 'project_relevance':
        return '建议: 增加体现技术深度和商业影响力的项目描述，强调技术栈与岗位的匹配。';
      case 'education_match':
        return '建议: 补充与岗位相关的课程、证书或持续教育经历。';
      case 'format_quality':
        return '建议: 使用标准单栏布局，避免表格、图片和特殊字符，使用常规字体。';
      default:
        return '建议: 针对此维度进行专项优化。';
    }
  }

  private calculateOverallConfidence(
    dimensions: DimensionScore[],
    _llmOutput: LLMAnalysisOutput,
  ): number {
    // 加权平均各维度的置信度
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const weightedConfidence = dimensions.reduce(
      (sum, d) => sum + d.confidence * d.weight,
      0,
    );
    return Math.round((weightedConfidence / totalWeight) * 100) / 100;
  }

  private buildFormatBreakdown(rule: RuleEngineOutput): string[] {
    const f = rule.formatQuality.details;
    const items: string[] = [];

    if (f.hasStandardSections) items.push('✅ 标准章节结构');
    else items.push('⚠️ 缺少标准章节');

    if (f.usesTablesOrColumns) items.push('❌ 使用了表格/多栏');
    else items.push('✅ 单栏布局');

    if (f.usesImagesOrGraphics) items.push('❌ 包含图片/图表');

    if (f.contactInfoCompleteness) items.push('✅ 联系方式完整');
    else items.push('⚠️ 联系方式不完整');

    items.push(`行为动词密度: ${Math.round(f.actionVerbDensity)}%`);

    return items;
  }
}
