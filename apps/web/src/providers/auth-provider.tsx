'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/verify-email', '/reset-password'];

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((r) => path === r || path.startsWith('/blog/') || path.startsWith('/legal/'));
}

/**
 * AuthProvider — 认证状态初始化
 *
 * [FIXED #7] 三态加载: 'idle' → 'checking' → 'ready'
 * 在 authReady 之前不渲染子组件，彻底杜绝 Dashboard 在认证完成前渲染导致的 401 闪烁
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, setAuth, setLoading, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  // [FIXED] 三态: idle → checking → ready
  const [authState, setAuthState] = useState<'idle' | 'checking' | 'ready'>('idle');

  // 配置 API Client (仅一次)
  useEffect(() => {
    apiClient.configure({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onRefreshFailed: () => {
        clearAuth();
        queryClient.clear();
        if (!isPublicRoute(window.location.pathname)) {
          router.push('/login');
        }
      },
    });
  }, []);

  // 初始化认证状态
  useEffect(() => {
    async function initAuth() {
      if (isAuthenticated) {
        setAuthState('ready');
        return;
      }
      setAuthState('checking');

      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // [FIXED] 10s timeout

        const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) {
            const userRes = await fetch(`${apiBase}/api/v1/auth/me`, {
              headers: { Authorization: `Bearer ${data.accessToken}` },
            });
            if (userRes.ok) {
              const user = await userRes.json();
              setAuth(data.accessToken, user);
              setAuthState('ready');
              return;
            }
          }
        }
      } catch {
        // 未登录 — 正常情况
      }

      setLoading(false);
      setAuthState('ready');
    }

    initAuth();
  }, []);

  // 路由保护
  useEffect(() => {
    if (authState === 'ready' && !isAuthenticated && !isPublicRoute(pathname)) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [authState, isAuthenticated, pathname]);

  // [FIXED] 在认证检查完成前显示加载页 (而非空白或半渲染)
  if (authState !== 'ready' && !isPublicRoute(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">正在加载...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
