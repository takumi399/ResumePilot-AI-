'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ATSScoreResult, JobItem } from '@/types';
import { cn, atsScoreColor, atsRatingLabel } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Lightbulb, AlertTriangle, ArrowUp, Loader2, Play,
} from 'lucide-react';

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const { data: analysis, isLoading, refetch } = useQuery<ATSScoreResult>({
    queryKey: ['analysis', params.id],
    queryFn: () => apiClient.get(`/resumes/${params.id}/analysis`),
    retry: false,
  });

  const { data: jobsData } = useQuery<{ items: JobItem[] }>({
    queryKey: ['jobs'],
    queryFn: () => apiClient.get('/jobs'),
  });

  async function runAnalysis() {
    if (!selectedJobId) { setErrMsg('请选择目标岗位'); return; }
    setRunning(true); setErrMsg('');
    try {
      await apiClient.post(`/resumes/${params.id}/analyze`, { jobId: selectedJobId });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['analysis', 'history'] });
      await refetch();
    } catch (e: unknown) {
      setErrMsg((e as { message?: string }).message || '分析失败');
    } finally { setRunning(false); }
  }

  if (isLoading) return <AnalysisSkeleton />;

  if (!analysis || !analysis.dimensions) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <Card>
          <CardContent className="flex flex-col items-center py-8 space-y-4">
            <AlertTriangle className="size-10 text-amber-500" />
            <p className="text-center text-muted-foreground">暂无分析结果</p>
            {jobsData?.items?.length ? (
              <div className="w-full space-y-3">
                <Label>选择目标岗位</Label>
                <select className="w-full rounded-md border p-2 text-sm" value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
                  <option value="">-- 选择岗位 --</option>
                  {jobsData.items.map((j) => <option key={j.id} value={j.id}>{j.title} {j.company ? `@${j.company}` : ''}</option>)}
                </select>
                {errMsg && <p className="text-xs text-destructive">{errMsg}</p>}
                <Button onClick={runAnalysis} disabled={running} className="w-full">
                  {running ? <><Loader2 className="mr-2 size-4 animate-spin" /> DeepSeek 分析中...</> : <><Play className="mr-2 size-4" /> 开始分析</>}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">请先在「岗位管理」中添加目标岗位</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col items-center gap-4 p-8 md:flex-row md:gap-8 border rounded-lg bg-card">
        <div className="flex size-28 shrink-0 items-center justify-center rounded-full border-8 border-muted">
          <span className={cn('text-3xl font-bold', atsScoreColor(analysis.overallScore))}>{analysis.overallScore}</span>
        </div>
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-2xl font-bold">ATS 综合评分</h1>
          <div className="mt-2 flex flex-wrap justify-center gap-2 md:justify-start">
            <Badge variant="secondary" className="text-sm">{atsRatingLabel(analysis.rating)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">置信度: {Math.round(analysis.confidence * 100)}%</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {analysis.dimensions.map((dim) => (
          <Card key={dim.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{dim.label}</CardTitle>
                <span className={cn('text-lg font-bold', atsScoreColor(dim.score))}>{dim.score}</span>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={dim.score} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">权重 {Math.round(dim.weight * 100)}%</p>
              <ul className="mt-2 space-y-1">
                {dim.breakdown.map((b, i) => <li key={i} className="text-xs text-muted-foreground">{b}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {analysis.suggestions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="size-5" /> 优化建议</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.suggestions.map((s) => (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={s.severity === 'critical' ? 'destructive' : s.severity === 'high' ? 'default' : 'secondary'}>{s.severity}</Badge>
                        <span className="text-sm font-medium">{s.category}</span>
                      </div>
                      <p className="mt-2 text-sm">{s.explanation}</p>
                    </div>
                    <Badge variant="outline" className="ml-4 shrink-0 text-emerald-600"><ArrowUp className="mr-1 size-3" /> +{s.impactEstimate.scoreBoost}分</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Skeleton className="h-48" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    </div>
  );
}
