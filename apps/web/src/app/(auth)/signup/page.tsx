'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRegister } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2 } from 'lucide-react';

const signupSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须包含大小写字母和数字'),
  name: z.string().min(2, '名称至少需要 2 个字符').max(50).optional(),
});

type SignupForm = z.infer<typeof signupSchema>;

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  const router = useRouter();
  const register = useRegister();
  const [error, setError] = useState<string | null>(null);

  const { register: reg, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupForm) {
    setError(null);
    try {
      await register.mutateAsync(data);
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiErr = err as { message?: string | string[] };
      setError(Array.isArray(apiErr?.message) ? apiErr.message[0] : (apiErr?.message || '注册失败'));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto flex items-center justify-center gap-2 font-bold text-xl">
            <Sparkles className="size-6 text-primary" /> ResumePilot
          </Link>
          <CardTitle className="text-2xl">创建账户</CardTitle>
          <CardDescription>注册后即可使用 AI 简历优化</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名 (可选)</Label>
              <Input id="name" placeholder="张三" autoComplete="name" {...reg('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" placeholder="zhangsan@example.com" autoComplete="email" {...reg('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" placeholder="至少8位，包含大小写字母和数字" autoComplete="new-password" {...reg('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              注册
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            已有账户?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">立即登录</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
