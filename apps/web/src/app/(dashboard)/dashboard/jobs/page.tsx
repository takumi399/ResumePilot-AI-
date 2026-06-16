'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { JobItem } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Briefcase, MapPin, Trash2 } from 'lucide-react';

export default function JobsPage() {
  const [search, setSearch] = useState('');

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ items: JobItem[]; total: number }>({
    queryKey: ['jobs', search],
    queryFn: () => apiClient.get(`/jobs?search=${encodeURIComponent(search)}`),
  });

  const deleteJob = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/jobs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">岗位管理</h1>
          <p className="text-sm text-muted-foreground">管理目标岗位，用于简历匹配分析</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/jobs/new"><Plus className="mr-2 size-4" /> 添加岗位</Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索岗位名称或公司..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data?.items.length ? (
        <div className="grid gap-4">
          {data.items.map((job) => (
            <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
              <Card className="cursor-pointer transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-4 p-5">
                  <Briefcase className="size-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{job.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      {job.company && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {job.company}
                        </span>
                      )}
                      {job.location && <span>{job.location}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary">{job.sourceType === 'manual' ? '手动' : '导入'}</Badge>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(job.createdAt)}</span>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); if (confirm('删除这个岗位？')) deleteJob.mutate(job.id); }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Briefcase className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">还没有保存的岗位</p>
            <Button asChild variant="link" className="mt-1"><Link href="/dashboard/jobs/new">添加第一个岗位</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
