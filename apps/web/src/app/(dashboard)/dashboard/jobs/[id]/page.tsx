'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { JobItem } from '@/types';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Briefcase, MapPin, Clock, Link2 } from 'lucide-react';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: job, isLoading } = useQuery<JobItem & { rawText?: string }>({
    queryKey: ['jobs', params.id],
    queryFn: () => apiClient.get(`/jobs/${params.id}`),
    enabled: !!params.id,
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!job) return <p className="text-muted-foreground">岗位不存在</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 size-4" /> 返回
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {job.company && <span className="flex items-center gap-1"><Briefcase className="size-3" /> {job.company}</span>}
          {job.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {job.location}</span>}
          <span className="flex items-center gap-1"><Clock className="size-3" /> {formatDate(job.createdAt)}</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">职位描述</CardTitle></CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">{job.rawText || '暂无描述'}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
