import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OptimizationRequest,
  OptimizationResult,
  MissingSkillOptimization,
  WeakDescriptionOptimization,
  STARRewriteOptimization,
  ProjectOptimization,
  ExperienceOptimization,
  OptimizationMetadata,
  OptimizerResumeInput,
} from './dto/optimization.types';
import {
  BASE_SYSTEM_PROMPT,
  MISSING_SKILLS_SYSTEM_PROMPT,
  WEAK_DESCRIPTIONS_SYSTEM_PROMPT,
  STAR_REWRITE_SYSTEM_PROMPT,
  PROJECT_OPTIMIZATION_SYSTEM_PROMPT,
  EXPERIENCE_OPTIMIZATION_SYSTEM_PROMPT,
} from './prompts/system-prompts';
import {
  buildMissingSkillsPrompt,
  buildWeakDescriptionsPrompt,
  buildSTARRewritePrompt,
  buildProjectOptimizationPrompt,
  buildExperienceOptimizationPrompt,
} from './prompts/user-prompts';
import { OPTIMIZATION_SCHEMAS } from './schemas/openai-schemas';

/**
 * OptimizerService — 简历优化引擎
 *
 * 编排 5 个专项优化任务:
 *   1. 缺失技能分析
 *   2. 弱描述增强
 *   3. STAR 改写
 *   4. 项目优化
 *   5. 工作经历优化
 *
 * 并行 vs 串行:
 *   - 缺失技能 + 弱描述 → 可并行 (互不依赖)
 *   - STAR 改写 + 项目优化 → 可并行
 *   - 工作经历优化 → 依赖前四个结果 (串行，但在 aggressive 模式可与 full optimization 合并)
 *
 * 成本优化:
 *   - 保守模式: 3 次 LLM 调用 (缺失 + 弱描述 + STAR)
 *   - 激进模式: 1 次 LLM 调用 (full optimization schema)
 *   - 每次调用使用 gpt-4o-mini × Structured Outputs
 */
@Injectable()
export class OptimizerService {
  private readonly logger = new Logger(OptimizerService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('AI_API_KEY') || configService.get<string>('OPENAI_API_KEY') || '';
    this.baseUrl = configService.get<string>('AI_BASE_URL') || 'https://api.openai.com/v1';
    this.model = configService.get<string>('AI_MODEL') || 'gpt-4o-mini';
  }

  /**
   * 执行完整优化
   *
   * @param request 优化请求 (简历 + JD + ATS 评分 + 偏好)
   * @param tasks 要执行的优化任务 (默认全部)
   */
  async optimize(
    request: OptimizationRequest,
    tasks: Array<'missing_skills' | 'weak_descriptions' | 'star_rewrites' | 'project_optimizations' | 'experience_optimizations'> = [
      'missing_skills', 'weak_descriptions', 'star_rewrites',
      'project_optimizations', 'experience_optimizations',
    ],
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    this.logger.log(`优化引擎启动: level=${request.level} tasks=${tasks.join(',')}`);

    // ============================================================
    // Aggressive 模式 → 单次 Full Optimization
    // ============================================================
    if (request.level === 'aggressive' && tasks.length >= 4) {
      return this.executeFullOptimization(request, startTime);
    }

    // ============================================================
    // Conservative/Moderate 模式 → 并行专项优化
    // ============================================================
    const taskMap: Record<string, () => Promise<unknown>> = {};

    if (tasks.includes('missing_skills')) {
      taskMap.missing_skills = () => this.executeTask('missing_skills', request);
    }
    if (tasks.includes('weak_descriptions')) {
      taskMap.weak_descriptions = () => this.executeTask('weak_descriptions', request);
    }
    if (tasks.includes('star_rewrites')) {
      taskMap.star_rewrites = () => this.executeTask('star_rewrites', request);
    }
    if (tasks.includes('project_optimizations')) {
      taskMap.project_optimizations = () => this.executeTask('project_optimizations', request);
    }
    if (tasks.includes('experience_optimizations')) {
      taskMap.experience_optimizations = () => this.executeTask('experience_optimizations', request);
    }

    const results = await Promise.all(
      Object.entries(taskMap).map(async ([key, fn]) => {
        try {
          return { key, data: await fn() };
        } catch (error) {
          this.logger.error(`任务 ${key} 失败: ${(error as Error).message}`);
          return { key, data: [] };
        }
      }),
    );

    const merged: Record<string, unknown[]> = {};
    for (const { key, data } of results) {
      merged[key] = data as unknown[];
    }

    const totalSuggestions = Object.values(merged).reduce((sum, arr) => sum + arr.length, 0);
    const processingTimeMs = Date.now() - startTime;

    return {
      missingSkills: (merged.missing_skills as MissingSkillOptimization[]) || [],
      weakDescriptions: (merged.weak_descriptions as WeakDescriptionOptimization[]) || [],
      starRewrites: (merged.star_rewrites as STARRewriteOptimization[]) || [],
      projectOptimizations: (merged.project_optimizations as ProjectOptimization[]) || [],
      experienceOptimizations: (merged.experience_optimizations as ExperienceOptimization[]) || [],
      metadata: {
        model: 'gpt-4o-mini',
        level: request.level,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        processingTimeMs,
        totalSuggestions,
        estimatedOverallScoreBoost: this.estimateBoost(merged),
        generatedAt: new Date().toISOString(),
        engineVersion: '2.0.0',
      },
    };
  }

  // ========================================================================
  // 执行单个优化任务
  // ========================================================================

  private async executeTask(
    task: string,
    request: OptimizationRequest,
  ): Promise<unknown[]> {
    const { systemPrompt, userPrompt, schema } = this.getTaskConfig(task, request);

    const result = await this.callOpenAI(systemPrompt, userPrompt, schema);

    // 提取结果数组 (每个 Schema 的顶层 key 不同)
    const keyMap: Record<string, string> = {
      missing_skills: 'missing_skills',
      weak_descriptions: 'weak_descriptions',
      star_rewrites: 'star_rewrites',
      project_optimizations: 'project_optimizations',
      experience_optimizations: 'experience_optimizations',
    };

    return (result?.[keyMap[task]] as unknown[]) || [];
  }

  // ========================================================================
  // Full Optimization (aggressive)
  // ========================================================================

  private async executeFullOptimization(
    request: OptimizationRequest,
    startTime: number,
  ): Promise<OptimizationResult> {
    const userPrompt = `
${buildMissingSkillsPrompt(request)}

---

${buildWeakDescriptionsPrompt(request)}

---

${buildSTARRewritePrompt(request)}

---

${buildProjectOptimizationPrompt(request)}

---

${buildExperienceOptimizationPrompt(request)}

---

请将以上所有分析结果整合到一个完整的 JSON 输出中。
包含 optimized_resume (应用所有优化后的完整简历)。
`;

    const result = await this.callOpenAI(
      BASE_SYSTEM_PROMPT,
      userPrompt,
      OPTIMIZATION_SCHEMAS.full.schema,
    );

    const processingTimeMs = Date.now() - startTime;

    return {
      missingSkills: (result?.missing_skills as MissingSkillOptimization[]) || [],
      weakDescriptions: (result?.weak_descriptions as WeakDescriptionOptimization[]) || [],
      starRewrites: (result?.star_rewrites as STARRewriteOptimization[]) || [],
      projectOptimizations: (result?.project_optimizations as ProjectOptimization[]) || [],
      experienceOptimizations: (result?.experience_optimizations as ExperienceOptimization[]) || [],
      optimizedResume: result?.optimized_resume as OptimizerResumeInput | undefined,
      metadata: {
        model: 'gpt-4o-mini',
        level: request.level,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        processingTimeMs,
        totalSuggestions:
          ((result?.missing_skills as unknown[]) || []).length +
          ((result?.weak_descriptions as unknown[]) || []).length +
          ((result?.star_rewrites as unknown[]) || []).length,
        estimatedOverallScoreBoost:
          (result?.metadata_summary as Record<string, unknown>)?.estimated_overall_score_boost as number || 0,
        generatedAt: new Date().toISOString(),
        engineVersion: '2.0.0',
      },
    };
  }

  // ========================================================================
  // 任务配置映射
  // ========================================================================

  private getTaskConfig(task: string, request: OptimizationRequest) {
    const configs: Record<string, {
      systemPrompt: string;
      userPrompt: string;
      schema: Record<string, unknown>;
    }> = {
      missing_skills: {
        systemPrompt: MISSING_SKILLS_SYSTEM_PROMPT,
        userPrompt: buildMissingSkillsPrompt(request),
        schema: OPTIMIZATION_SCHEMAS.missing_skills.schema as Record<string, unknown>,
      },
      weak_descriptions: {
        systemPrompt: WEAK_DESCRIPTIONS_SYSTEM_PROMPT,
        userPrompt: buildWeakDescriptionsPrompt(request),
        schema: OPTIMIZATION_SCHEMAS.weak_descriptions.schema as Record<string, unknown>,
      },
      star_rewrites: {
        systemPrompt: STAR_REWRITE_SYSTEM_PROMPT,
        userPrompt: buildSTARRewritePrompt(request),
        schema: OPTIMIZATION_SCHEMAS.star_rewrites.schema as Record<string, unknown>,
      },
      project_optimizations: {
        systemPrompt: PROJECT_OPTIMIZATION_SYSTEM_PROMPT,
        userPrompt: buildProjectOptimizationPrompt(request),
        schema: OPTIMIZATION_SCHEMAS.project_optimizations.schema as Record<string, unknown>,
      },
      experience_optimizations: {
        systemPrompt: EXPERIENCE_OPTIMIZATION_SYSTEM_PROMPT,
        userPrompt: buildExperienceOptimizationPrompt(request),
        schema: OPTIMIZATION_SCHEMAS.experience_optimizations.schema as Record<string, unknown>,
      },
    };

    return configs[task];
  }

  // ========================================================================
  // OpenAI API 调用
  // ========================================================================

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    schema: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    if (!this.apiKey || this.apiKey.startsWith('sk-your-')) {
      this.logger.warn('AI API Key 未配置，返回空结果');
      return null;
    }

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'optimization_result',
              strict: true,
              schema,
            },
          },
          temperature: 0.2,
          max_tokens: 8000,  // 推理模型需要更多 token
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI 返回空内容');
      }

      return JSON.parse(content);
    } catch (error) {
      this.logger.error('OpenAI API 调用失败', (error as Error).stack);
      return null;
    }
  }

  // ========================================================================
  // Helper
  // ========================================================================

  private estimateBoost(merged: Record<string, unknown[]>): number {
    let total = 0;
    // 粗略估算: 每条建议 ≈ 1-5 分提升
    const perSuggestion: Record<string, number> = {
      missing_skills: 3,
      weak_descriptions: 2,
      star_rewrites: 2,
      project_optimizations: 1,
      experience_optimizations: 2,
    };

    for (const [key, arr] of Object.entries(merged)) {
      total += arr.length * (perSuggestion[key] || 1);
    }

    return Math.min(30, total); // 封顶 30 分
  }
}
