import { Controller, Get, Delete, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('分析')
@ApiBearerAuth('JWT-auth')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('history')
  @ApiOperation({ summary: '获取分析历史' })
  async getHistory(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.analysisService.getHistory(userId, page ? +page : 1, limit ? +limit : 20);
    // 确保前端收到 camelCase 字段名
    return {
      items: (result.items as Array<Record<string,unknown>>).map((r: Record<string,unknown>) => ({
        id: r.id,
        resumeId: r.resumeid || r.resume_id,
        resumeTitle: r.resumetitle || r.resume_title,
        jobId: r.jobid || r.job_id,
        jobTitle: r.jobtitle || r.job_title,
        atsScore: Number(r.atsscore || r.ats_score || 0),
        rating: r.rating,
        createdAt: r.createdat || r.created_at,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除分析记录' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.analysisService.remove(userId, id);
  }
}
