import { Module } from '@nestjs/common';
import { OptimizerService } from './optimizer.service';

/**
 * OptimizerModule — AI 简历优化引擎
 *
 * 依赖:
 *   - ConfigService (全局) — OpenAI API Key
 *   - ATSService (可选) — ATS 评分上下文
 *
 * 导出:
 *   - OptimizerService — 供 ATS 分析后的优化步骤使用
 */
@Module({
  providers: [OptimizerService],
  exports: [OptimizerService],
})
export class OptimizerModule {}
