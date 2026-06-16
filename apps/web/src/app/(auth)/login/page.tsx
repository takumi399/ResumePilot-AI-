'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    setError(null);
    try {
      await login.mutateAsync(data);
      router.push(redirectTo);
    } catch (err: unknown) {
      const apiErr = err as { message?: string | string[] };
      setError(Array.isArray(apiErr?.message) ? apiErr.message[0] : (apiErr?.message || '登录失败'));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto flex items-center justify-center gap-2 font-bold text-xl">
            <Sparkles className="size-6 text-primary" /> ResumePilot
          </Link>
          <CardTitle className="text-2xl">欢迎回来</CardTitle>
          <CardDescription>登录你的账户以继续</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="zhangsan@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">密码</Label>
                <Link href="/reset-password" className="text-xs text-muted-foreground hover:underline">
                  忘记密码?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              登录
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            还没有账户?{' '}
            <Link href="/signup" className="text-primary hover:underline font-medium">
              立即注册
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
