import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { title: string; company?: string; rawText: string; sourceUrl?: string }) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO jobs (id, user_id, title, company, raw_text, source_url, source_type, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, 'manual', 'active', now(), now())`,
      userId, data.title, data.company || null, data.rawText, data.sourceUrl || null
    );
    const result = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM jobs WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, userId
    );
    return result[0];
  }

  async findAll(userId: string, search?: string) {
    const where = search ? `AND (title ILIKE $2 OR company ILIKE $2)` : '';
    const params: (string | number)[] = [userId];
    if (search) params.push(`%${search}%`);

    const [items, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, title, company, location, job_type as "jobType", experience_level as "experienceLevel",
                source_type as "sourceType", status, created_at as "createdAt", updated_at as "updatedAt"
         FROM jobs WHERE user_id = $1::uuid AND deleted_at IS NULL ${where}
         ORDER BY created_at DESC LIMIT 50`, ...params
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM jobs WHERE user_id = $1::uuid AND deleted_at IS NULL ${where}`, ...params
      ),
    ]);
    return { items, total: Number(countResult[0]?.count ?? 0) };
  }

  async findOne(userId: string, id: string) {
    const result = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, title, company, location, job_type as "jobType", experience_level as "experienceLevel",
              source_type as "sourceType", status, raw_text as "rawText", created_at as "createdAt", updated_at as "updatedAt"
       FROM jobs WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`, id, userId
    );
    if (!result.length) throw new NotFoundException('岗位不存在');
    return result[0];
  }

  async remove(userId: string, id: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE jobs SET deleted_at = now() WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`, id, userId
    );
    return { success: true, message: '岗位已删除' };
  }
}
