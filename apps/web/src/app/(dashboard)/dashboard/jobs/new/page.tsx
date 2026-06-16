'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download } from 'lucide-react';

const jdSchema = z.object({
  title: z.string().min(2, '职位名称至少需要 2 个字符'),
  company: z.string().optional(),
  rawText: z.string().min(50, '请粘贴完整的职位描述 (至少 50 个字符)'),
  sourceUrl: z.string().url('请输入有效的 URL').optional().or(z.literal('')),
});

type JDForm = z.infer<typeof jdSchema>;

export default function NewJobPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<JDForm>({
    resolver: zodResolver(jdSchema),
  });

  const urlValue = watch('sourceUrl');

  /** 从 URL 抓取 JD 内容并自动填充 */
  async function fetchFromUrl() {
    if (!urlValue) return;
    setFetching(true);
    setError(null);
    try {
      // 通过后端代理抓取，避免浏览器的 CORS 限制
      // 先尝试服务端抓取
      const result = await apiClient.post<{ title: string; company: string; rawText: string; notice?: string }>('/jobs/fetch-url', { url: urlValue });
      if (result.notice) {
        // 服务端被拦截，用浏览器端 fetch（可绕过部分反爬）
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlValue)}`;
          const res = await fetch(proxyUrl);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const title = doc.title?.replace(/\s*[-|].*$/, '').trim() || '';
          const text = (doc.body?.innerText || html.replace(/<[^>]+>/g, '\n')).replace(/\n{3,}/g, '\n\n').slice(0, 5000).trim();
          if (text.length > 100) {
            setValue('title', title);
            setValue('rawText', text);
            return;
          }
        } catch { /* fall through */ }
        setError('自动抓取失败，请在职位页面右键 → 查看网页源代码 → 搜索 "job" 复制相关内容');
        return;
      }
      setValue('title', result.title || '');
      setValue('company', result.company || '');
      setValue('rawText', result.rawText || '');
    } catch {
      setError('抓取失败，请手动粘贴 JD 内容');
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(data: JDForm) {
    setError(null);
    try {
      const payload = { ...data, sourceUrl: data.sourceUrl || undefined };
      const result = await apiClient.post<{ id: string }>('/jobs', payload);
      router.push(`/dashboard/jobs/${result.id}`);
    } catch (err: unknown) {
      const apiErr = err as { message?: string | string[] };
      setError(Array.isArray(apiErr?.message) ? apiErr.message[0] : (apiErr?.message || '保存失败'));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">添加岗位</h1>
        <p className="text-sm text-muted-foreground">粘贴目标职位的 JD，或输入招聘链接自动抓取</p>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">职位信息</CardTitle>
          <CardDescription>填写职位基本信息，或粘贴招聘网站链接一键导入</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sourceUrl">招聘链接 (可选)</Label>
              <div className="flex gap-2">
                <Input id="sourceUrl" placeholder="https://www.zhipin.com/job_detail/xxx.html" {...register('sourceUrl')} />
                <Button type="button" variant="secondary" onClick={fetchFromUrl} disabled={fetching || !urlValue}>
                  {fetching ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  <span className="ml-1">抓取</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">职位名称 *</Label>
                <Input id="title" placeholder="例如: 高级后端开发工程师" {...register('title')} />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">公司名称</Label>
                <Input id="company" placeholder="例如: 字节跳动" {...register('company')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rawText">职位描述 * (也可以直接粘贴 JD 全文)</Label>
              <Textarea id="rawText" rows={12} placeholder="粘贴完整的 JD 内容..." {...register('rawText')} />
              {errors.rawText && <p className="text-xs text-destructive">{errors.rawText.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> 解析中...</> : '保存并解析'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
