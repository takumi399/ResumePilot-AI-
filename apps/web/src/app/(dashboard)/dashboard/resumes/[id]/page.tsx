'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useResumeDetail, useUpdateResume, useDeleteResume } from '@/hooks/use-resumes';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft, FileText, Download, Trash2, Save, Star,
  Clock, HardDrive, Archive, ArchiveRestore, ExternalLink,
} from 'lucide-react';

export default function ResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: resume, isLoading, isError } = useResumeDetail(params.id, { includeDownloadUrl: true });
  const updateResume = useUpdateResume();
  const deleteResume = useDeleteResume();

  const [editTitle, setEditTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) return (
    <div className="p-6 text-center">
      <p className="text-muted-foreground mb-4">简历不存在或已被删除</p>
      <Button onClick={() => window.location.href = '/dashboard'}>返回仪表盘</Button>
    </div>
  );
  if (!resume) return <p className="text-muted-foreground p-6">简历不存在</p>;

  const statusLabels: Record<string, string> = {
    PENDING: '待解析', PROCESSING: '解析中', COMPLETED: '已解析', FAILED: '解析失败', NEEDS_REVIEW: '需审核',
  };

  async function handleUpdate() {
    setError(null);
    try {
      await updateResume.mutateAsync({ id: resume!.id, title: editTitle || resume!.title });
      setIsEditing(false);
    } catch (err: unknown) {
      setError((err as { message?: string }).message || '更新失败');
    }
  }

  async function handleTogglePrimary() {
    await updateResume.mutateAsync({ id: resume!.id, isPrimary: !resume!.isPrimary });
  }

  async function handleToggleArchive() {
    const action = resume!.isArchived ? '取消归档' : '归档';
    await updateResume.mutateAsync({ id: resume!.id, isArchived: !resume!.isArchived });
  }

  async function handleDelete() {
    if (!confirm('确定要删除这份简历吗？可在30天内恢复。')) return;
    await deleteResume.mutateAsync({ id: resume!.id });
    router.push('/dashboard/resumes');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/dashboard/resumes')}>
          <ArrowLeft className="mr-2 size-4" /> 返回列表
        </Button>
        <div className="flex gap-2">
          {resume.downloadUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={resume.downloadUrl} target="_blank"><Download className="mr-2 size-4" /> 下载</a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/resumes/${resume.id}/analysis`}>
              <ExternalLink className="mr-2 size-4" /> 查看分析
            </Link>
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 size-4" /> 删除
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            {isEditing ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={editTitle || resume.title} onChange={(e) => setEditTitle(e.target.value)} />
                <Button size="sm" onClick={handleUpdate} disabled={updateResume.isPending}><Save className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>取消</Button>
              </div>
            ) : (
              <CardTitle className="text-xl cursor-pointer" onClick={() => { setEditTitle(resume.title); setIsEditing(true); }}>
                {resume.title}
              </CardTitle>
            )}
          </div>
          <CardDescription>{resume.originalFileName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" /> {resume.originalFileType}</div>
            <div className="flex items-center gap-2"><HardDrive className="size-4 text-muted-foreground" /> {resume.fileSizeFormatted}</div>
            <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /> {formatDate(resume.createdAt)}</div>
            <div><Badge variant="secondary">{statusLabels[resume.parseStatus] || resume.parseStatus}</Badge></div>
            {resume.pageCount && <div>共 {resume.pageCount} 页</div>}
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTogglePrimary}>
              <Star className={`mr-2 size-4 ${resume.isPrimary ? 'fill-amber-400 text-amber-400' : ''}`} />
              {resume.isPrimary ? '已设为主要' : '设为主要简历'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleToggleArchive}>
              {resume.isArchived ? <><ArchiveRestore className="mr-2 size-4" /> 取消归档</> : <><Archive className="mr-2 size-4" /> 归档</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
