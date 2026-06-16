import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StructuredResume,
  StructuredJobDescription,
  LLMAnalysisOutput,
  SkillSemanticResult,
  ExperienceDepthResult,
  ProjectDepthResult,
  CareerTrajectoryResult,
  ContextMatch,
  RuleEngineOutput,
} from './types';

/**
 * LLMAnalyzer — ATS 评分第二层: LLM 语义分析
 *
 * 职责:
 *   LLM 擅长理解语义含义 — 规则引擎无法做到的上下文理解
 *
 * 与规则引擎的互补关系:
 *   规则引擎 → "简历有 Python 技能，JD 要求 Python" (精确匹配)
 *   LLM     → "候选人用 Python 构建了分布式系统，符合 JD 的分布式系统经验要求" (语义理解)
 *
 * LLM 调用策略:
 *   1. 技能语义匹配 — gpt-4o-mini (成本优化)
 *   2. 经验深度分析 — gpt-4o-mini
 *   3. 职业轨迹分析 — gpt-4o-mini
 *
 * 为什么不用 GPT-4o:
 *   - 分析类任务 (非生成) gpt-4o-mini 足够胜任
 *   - 成本: mini 是 gpt-4o 的 1/20
 *   - 延迟: mini 响应更快 (~1s vs ~5s)
 *
 * Structured Outputs:
 *   使用 OpenAI 的 json_schema strict mode
 *   保证 LLM 返回的数据结构 100% 符合预期 Schema
 */
@Injectable()
export class LLMAnalyzer {
  private readonly logger = new Logger(LLMAnalyzer.name);
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled = configService.get<string>('app.nodeEnv') !== 'test';
    this.baseUrl = configService.get<string>('AI_BASE_URL') || 'https://api.openai.com/v1';
    this.apiKey = configService.get<string>('AI_API_KEY') || configService.get<string>('OPENAI_API_KEY') || '';
    this.model = configService.get<string>('AI_MODEL') || 'gpt-4o-mini';
  }

  /**
   * 主入口: LLM 辅助分析
   *
   * 接收规则引擎的中间结果作为上下文:
   *   - 已知的技能匹配/缺失信息 → LLM 不需要重复做关键词匹配
   *   - LLM 专注于语义理解 → 填补规则引擎的盲区
   */
  async analyze(
    resume: StructuredResume,
    jd: StructuredJobDescription,
    ruleOutput: RuleEngineOutput,
  ): Promise<LLMAnalysisOutput> {
    if (!this.enabled) {
      return this.emptyAnalysis();
    }

    this.logger.log('LLM 语义分析开始');

    // 并行执行三个独立的 LLM 分析 (互不依赖)
    const [skillSemantic, experienceDepth, projectDepth, careerTrajectory] =
      await Promise.all([
        this.analyzeSkillSemantics(resume, jd, ruleOutput),
        this.analyzeExperienceDepth(resume, jd),
        this.analyzeProjectDepth(resume, jd),
        this.analyzeCareerTrajectory(resume),
      ]);

    return {
      skillSemanticMatch: skillSemantic,
      experienceDepth,
      projectDepth,
      careerTrajectory,
      overallImpression: '',
    };
  }

  // ========================================================================
  // 1. 技能语义匹配 (LLM 增强)
  // ========================================================================

  /**
   * 语义技能匹配
   *
   * LLM 擅长:
   *   - 技能上下文验证: "Python" 出现在工作经历中 (实际使用) vs 技能列表中 (仅列举)
   *   - 隐性技能推断: "构建了 CI/CD 管道" → 推断出 Jenkins/GitHub Actions 经验
   *   - 技能深度判断: "精通 Python" vs "使用 Python 写脚本" 的区别
   */
  private async analyzeSkillSemantics(
    resume: StructuredResume,
    jd: StructuredJobDescription,
    ruleOutput: RuleEngineOutput,
  ): Promise<SkillSemanticResult> {
    // 仅对未匹配的必备技能做语义分析 (节约 Token)
    const missingSkills = ruleOutput.skillMatch.details.mustHaveMissing;
    if (missingSkills.length === 0) {
      return {
        score: 100,
        semanticSimilarity: 1.0,
        contextMatches: [],
        confidenceScore: 1.0,
      };
    }

    const prompt = this.buildSkillSemanticPrompt(resume, jd, missingSkills);

    try {
      const result = await this.callLLM(prompt, SKILL_SEMANTIC_SCHEMA);
      return this.parseSkillSemanticResult(result);
    } catch (error) {
      this.logger.error('LLM 技能语义分析失败', (error as Error).stack);
      return {
        score: 50,
        semanticSimilarity: 0.5,
        contextMatches: [],
        confidenceScore: 0.3,
      };
    }
  }

  // ========================================================================
  // 2. 经验深度分析
  // ========================================================================

  /**
   * 经验深度分析
   *
   * LLM 评估规则引擎无法量化的维度:
   *   - 工作的范围和影响力 (scope & impact)
   *   - 角色发展轨迹 (从 Junior → Senior 的成长速度)
   *   - 项目/团队的规模指标
   *   - 行业特定经验的价值
   */
  private async analyzeExperienceDepth(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): Promise<ExperienceDepthResult> {
    const prompt = this.buildExperienceDepthPrompt(resume, jd);

    try {
      const result = await this.callLLM(prompt, EXPERIENCE_DEPTH_SCHEMA);
      return this.parseExperienceDepthResult(result);
    } catch (error) {
      this.logger.error('LLM 经验深度分析失败', (error as Error).stack);
      return {
        score: 60,
        impactLevel: 'medium',
        roleProgression: 50,
        scopeIndicators: [],
        confidenceScore: 0.3,
      };
    }
  }

  // ========================================================================
  // 3. 项目深度分析
  // ========================================================================

  private async analyzeProjectDepth(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): Promise<ProjectDepthResult> {
    if (resume.projects.length === 0) {
      return { score: 50, technicalDepth: 50, businessImpact: 50, confidenceScore: 1 };
    }

    const prompt = this.buildProjectDepthPrompt(resume, jd);

    try {
      const result = await this.callLLM(prompt, PROJECT_DEPTH_SCHEMA);
      return this.parseProjectDepthResult(result);
    } catch (error) {
      this.logger.error('LLM 项目深度分析失败', (error as Error).stack);
      return {
        score: 50,
        technicalDepth: 50,
        businessImpact: 50,
        confidenceScore: 0.3,
      };
    }
  }

  // ========================================================================
  // 4. 职业轨迹分析
  // ========================================================================

  private async analyzeCareerTrajectory(
    resume: StructuredResume,
  ): Promise<CareerTrajectoryResult> {
    if (resume.workExperience.length < 2) {
      return {
        score: 60,
        growthRate: 50,
        stabilityScore: 80,
        promotionIndicators: 0,
        confidenceScore: 1,
      };
    }

    const prompt = this.buildCareerTrajectoryPrompt(resume);

    try {
      const result = await this.callLLM(prompt, CAREER_TRAJECTORY_SCHEMA);
      return this.parseCareerTrajectoryResult(result);
    } catch (error) {
      this.logger.error('LLM 职业轨迹分析失败', (error as Error).stack);
      return {
        score: 50,
        growthRate: 50,
        stabilityScore: 50,
        promotionIndicators: 0,
        confidenceScore: 0.3,
      };
    }
  }

  // ========================================================================
  // Prompt 构建
  // ========================================================================

  private buildSkillSemanticPrompt(
    resume: StructuredResume,
    jd: StructuredJobDescription,
    missingSkills: string[],
  ): string {
    return `你是一位ATS系统分析师。请分析候选人简历中是否通过其他方式（隐性经验、相关技能、项目经历）涵盖了以下JD未直接匹配的技能。

目标岗位: ${jd.title}
缺失技能: ${missingSkills.join(', ')}

候选人工作经历摘要:
${resume.workExperience.map((e, i) => `
[${i + 1}] ${e.title} @ ${e.company}
${e.description}
要点: ${e.highlights.join('; ')}
技术栈: ${e.technologies.join(', ')}
`).join('\n')}

候选人项目经历:
${resume.projects.map((p, i) => `
[${i + 1}] ${p.name}
${p.description}
技术栈: ${p.technologies.join(', ')}
`).join('\n')}

请判断: 对于每个缺失技能，候选人是否通过相关经验/技术间接具备该能力。
只返回 JSON，不要解释。`;
  }

  private buildExperienceDepthPrompt(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): string {
    return `评估候选人的工作经验深度与目标岗位 "${jd.title}" 的匹配度。

目标岗位职责:
${jd.responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}

候选人经历:
${resume.workExperience.map((e, i) => `
[${i + 1}] ${e.title} @ ${e.company} (${e.startDate} - ${e.isCurrent ? '至今' : e.endDate})
${e.description}
要点:
${e.highlights.map(h => `  - ${h}`).join('\n')}
`).join('\n')}

分析维度:
1. 工作范围的匹配度 (scope alignment)
2. 成果的影响级别 (impact level: low/medium/high/exceptional)
3. 职业发展速度 (role progression)
4. 工作经验的深度 vs 广度

只返回 JSON。`;
  }

  private buildProjectDepthPrompt(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): string {
    return `评估候选人的项目经历深度与 "${jd.title}" 的相关性。

候选人项目:
${resume.projects.map((p, i) => `
[${i + 1}] ${p.name}
${p.description}
要点: ${p.highlights.join('; ')}
技术: ${p.technologies.join(', ')}
`).join('\n')}

评估技术深度和商业影响，分数 0-100。只返回 JSON。`;
  }

  private buildCareerTrajectoryPrompt(resume: StructuredResume): string {
    return `分析以下候选人的职业发展轨迹:

${resume.workExperience.map((e, i) => `
${i + 1}. ${e.title} @ ${e.company} (${e.startDate} - ${e.isCurrent ? '至今' : e.endDate})
`).join('\n')}

评估成长速度(0-100)、稳定性(0-100)、晋升迹象数量。只返回 JSON。`;
  }

  // ========================================================================
  // LLM 调用 (带重试)
  // ========================================================================

  /**
   * [FIXED #9] 带指数退避重试的 LLM 调用
   * - 429 (Rate Limit) → 读取 Retry-After 头，带 jitter 重试
   * - 5xx (Server Error) → 指数退避重试
   * - 最多重试 3 次
   */
  private async callLLM(
    prompt: string,
    schema: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.apiKey || this.apiKey.startsWith('sk-your-')) {
      this.logger.warn('AI API Key 未配置，使用模拟结果');
      return this.mockLLMResponse(schema);
    }

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: '你是一位精准的ATS简历分析系统。只返回有效的JSON，不要任何额外文本。' },
              { role: 'user', content: prompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'ats_analysis', strict: true, schema },
            },
            temperature: 0.1,
            max_tokens: 4000,  // 推理模型需要更多 token (含 reasoning_content)
          }),
          signal: AbortSignal.timeout(30000), // 30s 超时
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
          const delay = retryAfter * 1000 * (attempt + 1) + Math.random() * 1000;
          this.logger.warn(`OpenAI 429 限流，${delay}ms 后重试 (第 ${attempt + 1}/${maxRetries} 次)`);
          await this.sleep(delay);
          continue;
        }

        if (response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          this.logger.warn(`OpenAI ${response.status} 服务端错误，${delay}ms 后重试 (第 ${attempt + 1}/${maxRetries} 次)`);
          await this.sleep(delay);
          continue;
        }

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('OpenAI 返回空内容');

        return JSON.parse(content);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error; // 最后一次重试仍失败 → 抛出异常
        }
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }

    throw new Error('OpenAI API 不可达');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================================================
  // 结果解析
  // ========================================================================

  private parseSkillSemanticResult(
    result: Record<string, unknown>,
  ): SkillSemanticResult {
    const matches = (result.context_matches || []) as Array<Record<string, unknown>>;
    return {
      score: (result.semantic_match_score as number) || 50,
      semanticSimilarity: (result.semantic_similarity as number) || 0.5,
      contextMatches: matches.map((m) => ({
        skill: (m.skill as string) || '',
        foundInContext: (m.found_in_context as boolean) || false,
        contextQuality: (m.context_quality as number) || 50,
        evidence: (m.evidence as string) || '',
      })),
      confidenceScore: (result.confidence as number) || 0.5,
    };
  }

  private parseExperienceDepthResult(
    result: Record<string, unknown>,
  ): ExperienceDepthResult {
    return {
      score: (result.score as number) || 60,
      impactLevel: (result.impact_level as ExperienceDepthResult['impactLevel']) || 'medium',
      roleProgression: (result.role_progression as number) || 50,
      scopeIndicators: (result.scope_indicators as string[]) || [],
      confidenceScore: (result.confidence as number) || 0.5,
    };
  }

  private parseProjectDepthResult(
    result: Record<string, unknown>,
  ): ProjectDepthResult {
    return {
      score: (result.score as number) || 50,
      technicalDepth: (result.technical_depth as number) || 50,
      businessImpact: (result.business_impact as number) || 50,
      confidenceScore: (result.confidence as number) || 0.5,
    };
  }

  private parseCareerTrajectoryResult(
    result: Record<string, unknown>,
  ): CareerTrajectoryResult {
    return {
      score: (result.score as number) || 50,
      growthRate: (result.growth_rate as number) || 50,
      stabilityScore: (result.stability_score as number) || 50,
      promotionIndicators: (result.promotion_indicators as number) || 0,
      confidenceScore: (result.confidence as number) || 0.5,
    };
  }

  // ========================================================================
  // 回退
  // ========================================================================

  private mockLLMResponse(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    // 当 API key 未配置时返回中性值 (不影响规则引擎的结果)
    const props = schema.properties as Record<string, unknown> | undefined;
    const mock: Record<string, unknown> = {};

    if (props) {
      for (const [key, value] of Object.entries(props)) {
        const prop = value as Record<string, string>;
        switch (prop.type) {
          case 'number': mock[key] = 60; break;
          case 'array': mock[key] = []; break;
          case 'boolean': mock[key] = false; break;
          case 'string': mock[key] = '未评估'; break;
          default: mock[key] = null;
        }
      }
    }

    return mock;
  }

  private emptyAnalysis(): LLMAnalysisOutput {
    return {
      skillSemanticMatch: { score: 50, semanticSimilarity: 0.5, contextMatches: [], confidenceScore: 0.3 },
      experienceDepth: { score: 50, impactLevel: 'medium', roleProgression: 50, scopeIndicators: [], confidenceScore: 0.3 },
      projectDepth: { score: 50, technicalDepth: 50, businessImpact: 50, confidenceScore: 0.3 },
      careerTrajectory: { score: 50, growthRate: 50, stabilityScore: 50, promotionIndicators: 0, confidenceScore: 0.3 },
      overallImpression: '',
    };
  }
}

// ============================================================================
// LLM Structured Output JSON Schemas
// ============================================================================

const SKILL_SEMANTIC_SCHEMA = {
  type: 'object',
  properties: {
    semantic_match_score: { type: 'number', description: '0-100 语义匹配分数' },
    semantic_similarity: { type: 'number', description: '0-1 语义相似度' },
    context_matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill: { type: 'string' },
          found_in_context: { type: 'boolean' },
          context_quality: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['skill', 'found_in_context', 'context_quality', 'evidence'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'number' },
  },
  required: ['semantic_match_score', 'semantic_similarity', 'context_matches', 'confidence'],
  additionalProperties: false,
};

const EXPERIENCE_DEPTH_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    impact_level: { type: 'string', enum: ['low', 'medium', 'high', 'exceptional'] },
    role_progression: { type: 'number' },
    scope_indicators: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['score', 'impact_level', 'role_progression', 'scope_indicators', 'confidence'],
  additionalProperties: false,
};

const PROJECT_DEPTH_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    technical_depth: { type: 'number' },
    business_impact: { type: 'number' },
    confidence: { type: 'number' },
  },
  required: ['score', 'technical_depth', 'business_impact', 'confidence'],
  additionalProperties: false,
};

const CAREER_TRAJECTORY_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    growth_rate: { type: 'number' },
    stability_score: { type: 'number' },
    promotion_indicators: { type: 'number' },
    confidence: { type: 'number' },
  },
  required: ['score', 'growth_rate', 'stability_score', 'promotion_indicators', 'confidence'],
  additionalProperties: false,
};
