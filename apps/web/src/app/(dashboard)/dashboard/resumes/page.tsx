'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useResumeList, useDeleteResume, useUpdateResume } from '@/hooks/use-resumes';
import { formatRelativeTime, cn, atsScoreColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus, Upload, Search, FileText, Trash2, Star,
  Archive, MoreHorizontal, ExternalLink,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  PENDING: '待解析', PROCESSING: '解析中', COMPLETED: '已解析',
  FAILED: '失败', NEEDS_REVIEW: '需审核',
};

export default function ResumesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useResumeList({ page, limit: 20, search: search || undefined });
  const deleteResume = useDeleteResume();
  const updateResume = useUpdateResume();

  async function handleDelete(id: string) {
    await deleteResume.mutateAsync({ id });
  }

  async function handleSetPrimary(id: string) {
    await updateResume.mutateAsync({ id, isPrimary: true });
  }

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">我的简历</h1>
          <p className="text-sm text-muted-foreground">管理你的简历文件，上传新简历或查看已有简历</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/resumes/upload"><Upload className="mr-2 size-4" /> 上传简历</Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="搜索简历标题..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((resume) => (
            <div key={resume.id} className="group flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary/30">
              <FileText className="size-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/dashboard/resumes/${resume.id}`} className="font-medium truncate hover:text-primary">
                    {resume.title}
                  </Link>
                  {resume.isPrimary && <Badge variant="secondary" className="text-xs"><Star className="mr-1 size-2 fill-amber-400" /> 主要</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span>{resume.originalFileName}</span>
                  <span>·</span>
                  <span>{resume.fileSizeFormatted}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(resume.createdAt)}</span>
                </div>
              </div>

              <Badge variant="outline" className="shrink-0">{statusLabels[resume.parseStatus] || resume.parseStatus}</Badge>

              <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" title="设为主要" onClick={() => handleSetPrimary(resume.id)}>
                  <Star className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" title="查看分析" asChild>
                  <Link href={`/dashboard/resumes/${resume.id}/analysis`}><ExternalLink className="size-4" /></Link>
                </Button>
                <Button variant="ghost" size="icon" title="删除" onClick={() => handleDelete(resume.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{page} / {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <FileText className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">还没有简历</p>
            <Button asChild variant="link" className="mt-1"><Link href="/dashboard/resumes/upload">上传第一份简历</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
