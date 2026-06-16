'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalysisHistory } from '@/hooks/use-analysis';
import { apiClient } from '@/lib/api-client';
import { cn, atsScoreColor, atsRatingLabel, formatRelativeTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { History, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data, isLoading } = useAnalysisHistory({ page, limit: 20 });

  async function handleDelete(id: string) {
    if (!confirm('删除这条分析记录？')) return;
    await apiClient.delete(`/analysis/${id}`);
    queryClient.invalidateQueries({ queryKey: ['analysis', 'history'] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">分析历史</h1>
        <p className="text-sm text-muted-foreground">查看所有简历-岗位匹配分析记录</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : data?.items.length ? (
        <>
          <div className="space-y-3">
            {data.items.map((item) => (
              <Link key={item.id} href={`/dashboard/resumes/${item.resumeId}/analysis`}>
                <Card className="cursor-pointer transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold', atsScoreColor(item.atsScore).replace('text-', 'bg-').replace('-500', '-100'))}>
                      <span className={atsScoreColor(item.atsScore)}>{item.atsScore}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.resumeTitle} ↔ {item.jobTitle}</p>
                      <p className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
                    </div>
                    <Badge variant="secondary">{atsRatingLabel(item.rating)}</Badge>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); handleDelete(item.id); }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-4" /> 上一页
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                下一页 <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <History className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">还没有分析记录</p>
            <p className="text-xs text-muted-foreground mt-1">上传简历并添加岗位后即可开始分析</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
