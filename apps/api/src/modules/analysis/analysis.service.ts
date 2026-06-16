import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [items, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT ar.id, ar.resume_id as resumeId, r.title as resumeTitle,
                ar.job_id as jobId, j.title as jobTitle,
                ar.ats_score_total as atsScore,
                CASE
                  WHEN ar.ats_score_total >= 85 THEN 'excellent'
                  WHEN ar.ats_score_total >= 70 THEN 'good'
                  WHEN ar.ats_score_total >= 50 THEN 'fair'
                  WHEN ar.ats_score_total >= 30 THEN 'poor'
                  ELSE 'fail'
                END as rating,
                ar.created_at as createdAt
         FROM analysis_results ar
         JOIN resumes r ON ar.resume_id = r.id
         JOIN jobs j ON ar.job_id = j.id
         WHERE ar.user_id = $1::uuid AND ar.status = 'completed'
         ORDER BY ar.created_at DESC
         LIMIT $2 OFFSET $3`, userId, limit, offset
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM analysis_results WHERE user_id = $1::uuid AND status = 'completed'`, userId
      ),
    ]);
    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
    };
  }

  async remove(userId: string, id: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM analysis_results WHERE id = $1::uuid AND user_id = $2::uuid`, id, userId
    );
    return { success: true, message: '分析记录已删除' };
  }
}
