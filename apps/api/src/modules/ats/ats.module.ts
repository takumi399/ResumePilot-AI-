import { Module } from '@nestjs/common';
import { ATSService } from './ats.service';
import { RuleEngine } from './engine/rule-engine';
import { LLMAnalyzer } from './engine/llm-analyzer';
import { ScoreFusion } from './engine/score-fusion';

/**
 * ATSModule — ATS 评分引擎模块
 *
 * 三层引擎:
 *   - RuleEngine: 确定性规则评分
 *   - LLMAnalyzer: LLM 语义分析
 *   - ScoreFusion: 评分融合与校准
 *
 * 依赖:
 *   - PrismaService (全局) — 数据加载和结果持久化
 *   - ConfigService (全局) — OpenAI API Key
 *
 * 注意: 此模块目前通过 ATSService 在其他模块中调用
 * Controller 将在后续迭代中添加到 ResumesController 或独立分析端点
 */
@Module({
  providers: [ATSService, RuleEngine, LLMAnalyzer, ScoreFusion],
  exports: [ATSService, RuleEngine],
})
export class ATSModule {}
