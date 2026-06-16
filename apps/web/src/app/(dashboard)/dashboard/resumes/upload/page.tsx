'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useUploadResume } from '@/hooks/use-resumes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

const ALLOWED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadResumePage() {
  const router = useRouter();
  const upload = useUploadResume();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], rejected: Array<{ file: File; errors: ReadonlyArray<{ code: string; message: string }> }>) => {
    setError(null);
    if (rejected.length > 0) {
      const msg = rejected[0].errors[0]?.code === 'file-too-large'
        ? '文件超过 10MB 限制'
        : '不支持的文件格式，请上传 PDF、DOCX 或 TXT 文件';
      setError(msg);
      return;
    }
    if (accepted.length > 0) {
      setFile(accepted[0]);
      if (!title) setTitle(accepted[0].name.replace(/\.[^.]+$/, ''));
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    multiple: false,
  });

  async function handleUpload() {
    if (!file) return;
    setError(null);
    try {
      const result = await upload.mutateAsync({ file, title: title || undefined });
      router.push(`/dashboard/resumes/${result.resume.id}`);
    } catch (err: unknown) {
      const apiErr = err as { message?: string | string[] };
      setError(Array.isArray(apiErr?.message) ? apiErr.message[0] : (apiErr?.message || '上传失败'));
    }
  }

  const isUploading = upload.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">上传简历</h1>
        <p className="text-sm text-muted-foreground">支持 PDF、DOCX、TXT 格式，最大 10MB</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 文件拖放区 */}
      {!file ? (
        <Card>
          <CardContent className="pt-6">
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <input {...getInputProps()} />
              <Upload className="size-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">拖放简历文件到此处</p>
              <p className="text-xs text-muted-foreground mt-1">或点击选择文件</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* 文件已选择 */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              已选择文件
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {file.type}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setFile(null); setError(null); }}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">简历标题 (可选)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如: 张三 — 后端工程师简历"
              />
            </div>

            {isUploading && <Progress value={undefined} className="animate-pulse" />}

            <Button onClick={handleUpload} disabled={isUploading} className="w-full">
              {isUploading ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> 上传中...</>
              ) : (
                <><Upload className="mr-2 size-4" /> 上传并解析</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 提示 */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><CheckCircle className="size-3 text-emerald-500" /> 使用单栏布局的 PDF 文件 ATS 解析效果最佳</p>
            <p className="flex items-center gap-2"><CheckCircle className="size-3 text-emerald-500" /> 避免使用表格、图片和特殊字体</p>
            <p className="flex items-center gap-2"><AlertTriangle className="size-3 text-amber-500" /> 扫描件/图片型 PDF 需要 OCR 处理，可能影响解析质量</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
