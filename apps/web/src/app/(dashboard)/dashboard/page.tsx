'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { DashboardStats, ResumeListResponse } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  FileText, Briefcase, TrendingUp, Trophy, Upload, Plus, ArrowRight,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient.get('/dashboard/stats'),
  });

  const { data: recentResumes } = useQuery<ResumeListResponse>({
    queryKey: ['resumes', { page: 1, limit: 5 }],
    queryFn: () => apiClient.get('/resumes?page=1&limit=5'),
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-sm text-muted-foreground">欢迎回来，查看你的简历优化进度</p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/dashboard/resumes/upload">
              <Upload className="mr-2 size-4" /> 上传简历
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/jobs/new">
              <Plus className="mr-2 size-4" /> 添加岗位
            </Link>
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="简历总数" value={stats?.totalResumes ?? 0}
          icon={FileText} description="已上传的简历"
        />
        <StatCard
          title="岗位数量" value={stats?.totalJobs ?? 0}
          icon={Briefcase} description="已保存的 JD"
        />
        <StatCard
          title="分析次数" value={stats?.totalAnalyses ?? 0}
          icon={TrendingUp}
          description={`本月 ${stats?.analysesThisMonth ?? 0} 次`}
        />
        <StatCard
          title="最佳 ATS 评分"
          value={stats?.bestAtsScore ? `${stats.bestAtsScore}` : '—'}
          icon={Trophy}
          description={`平均 ${stats?.avgAtsScore?.toFixed(0) ?? '—'} 分`}
        />
      </div>

      {/* 评分趋势 + 最近简历 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">ATS 评分分布</CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="space-y-4">
                {[
                  { label: '优秀 (85+)', key: 'excellent' as const, color: 'bg-emerald-500' },
                  { label: '良好 (70-84)', key: 'good' as const, color: 'bg-blue-500' },
                  { label: '一般 (50-69)', key: 'fair' as const, color: 'bg-amber-500' },
                  { label: '需改进 (<50)', key: 'poor' as const, color: 'bg-red-500' },
                ].map((item) => {
                  const count = stats.scoreDistribution?.[item.key] ?? 0;
                  const total = Math.max(1, Object.values(stats.scoreDistribution ?? {}).reduce<number>((a: number, b: number) => a + b, 0));
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">{count} 份 ({pct}%)</span>
                      </div>
                      <Progress value={pct || 5} className={item.color} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无分析数据</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">最近简历</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/resumes">查看全部 <ArrowRight className="ml-1 size-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentResumes?.items.length ? (
              <div className="space-y-3">
                {recentResumes.items.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/resumes/${r.id}`}
                    className="flex items-center justify-between rounded-lg p-2 hover:bg-muted transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.parseStatus === 'COMPLETED' ? '✅' : '⏳'} {r.fileSizeFormatted}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">还没有简历</p>
                <Button variant="link" size="sm" asChild>
                  <Link href="/dashboard/resumes/upload">上传第一份简历</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, description,
}: {
  title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
