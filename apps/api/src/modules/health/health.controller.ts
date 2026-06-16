import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('健康检查')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '存活检查 (K8s liveness probe)' })
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: '就绪检查 (K8s readiness probe)' })
  async ready() {
    const checks: Record<string, string> = {};

    try { await this.prisma.$queryRaw`SELECT 1`; checks['database'] = 'ok'; }
    catch { checks['database'] = 'error'; }

    try { await this.redis.ping(); checks['redis'] = 'ok'; }
    catch { checks['redis'] = 'error'; }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return {
      status: allOk ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
