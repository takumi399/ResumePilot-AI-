import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string) {
    const [totalResumes, totalJobs, totalAnalyses, avgScore, analysesThisMonth, bestRes] = await Promise.all([
      this.prisma.resume.count({ where: { userId, deletedAt: null } }),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::int as count FROM jobs WHERE user_id = $1::uuid AND deleted_at IS NULL`, userId
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::int as count FROM analysis_results WHERE user_id = $1::uuid AND status = 'completed'`, userId
      ),
      this.prisma.$queryRawUnsafe<Array<{ avg: number }>>(
        `SELECT COALESCE(AVG(ats_score_total), 0) as avg FROM analysis_results WHERE user_id = $1::uuid AND status = 'completed'`, userId
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::int as count FROM analysis_results WHERE user_id = $1::uuid AND status = 'completed' AND created_at >= date_trunc('month', now())`, userId
      ),
      this.prisma.$queryRawUnsafe<Array<{ best: number }>>(
        `SELECT COALESCE(MAX(ats_score_total), 0) as best FROM analysis_results WHERE user_id = $1::uuid AND status = 'completed'`, userId
      ),
    ]);

    const distribution = await this.prisma.$queryRawUnsafe<Array<{ range: string; count: bigint }>>(
      `SELECT
        CASE
          WHEN ats_score_total >= 85 THEN 'excellent'
          WHEN ats_score_total >= 70 THEN 'good'
          WHEN ats_score_total >= 50 THEN 'fair'
          ELSE 'poor'
        END as range,
        COUNT(*)::int as count
       FROM analysis_results
       WHERE user_id = $1::uuid AND status = 'completed'
       GROUP BY range`, userId
    );

    const scoreDistribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
    for (const row of distribution) {
      scoreDistribution[row.range as keyof typeof scoreDistribution] = Number(row.count);
    }

    return {
      totalResumes,
      totalJobs: Number(totalJobs[0]?.count ?? 0),
      totalAnalyses: Number(totalAnalyses[0]?.count ?? 0),
      avgAtsScore: Math.round(Number(avgScore[0]?.avg ?? 0)),
      bestAtsScore: Math.round(Number(bestRes[0]?.best ?? 0)),
      analysesThisMonth: Number(analysesThisMonth[0]?.count ?? 0),
      scoreDistribution,
      memberSince: '',
    };
  }
}
