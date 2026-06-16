// ============================================================================
// ResumePilot AI — API Client
// ============================================================================
//
// 设计原则:
//   1. 单一 fetch wrapper — 所有请求经过同一出口，便于统一处理认证、日志、错误
//   2. Access Token 自动注入 — 从 Zustand store 读取，无需每个调用手动传
//   3. 401 自动刷新 — 拦截 401 → 尝试 refresh → 重试原请求 → 失败则跳转登录
//   4. 类型安全 — 泛型约束请求和响应类型
//   5. API_URL 通过环境变量注入 — 开发/生产环境自动切换
// ============================================================================

import type { ApiError } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_PREFIX = '/api/v1';

class ApiClient {
  private getAccessToken: (() => string | null) | null = null;
  private onRefreshFailed: (() => void) | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  /** 注册 token 获取器和刷新失败回调 (由 AuthProvider 调用) */
  configure(opts: {
    getAccessToken: () => string | null;
    onRefreshFailed: () => void;
  }): void {
    this.getAccessToken = opts.getAccessToken;
    this.onRefreshFailed = opts.onRefreshFailed;
  }

  /** 核心请求方法 */
  async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${API_URL}${API_PREFIX}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // 注入 Access Token
    const token = this.getAccessToken?.();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Cookie (Refresh Token)
    });

    // 401 → 尝试刷新
    if (response.status === 401 && token) {
      response = await this.handleTokenRefresh(url, options, headers);
    }

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        message: response.statusText,
        error: 'Unknown Error',
        timestamp: new Date().toISOString(),
        path: endpoint,
      }));
      throw error;
    }

    return response.json();
  }

  /** Token 刷新逻辑 (防并发) */
  private async handleTokenRefresh(
    url: string,
    options: RequestInit,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshPromise = this.executeRefresh();
    }

    const newToken = await this.refreshPromise;
    this.isRefreshing = false;
    this.refreshPromise = null;

    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(url, { ...options, headers, credentials: 'include' });
    }

    this.onRefreshFailed?.();
    throw new Error('Session expired');
  }

  private async executeRefresh(): Promise<string | null> {
    // [FIXED #10] 添加 AbortController 超时 — 防止刷新请求挂起导致所有 API 调用永久阻塞
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 秒超时

    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        return data.accessToken || null;
      }
    } catch {
      /* 超时或网络错误 */
    } finally {
      clearTimeout(timeoutId);
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
    return null;
  }

  // ========================================================================
  // Convenience methods
  // ========================================================================

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /** 文件上传 (multipart/form-data) */
  async upload<T>(endpoint: string, file: File, fields?: Record<string, string>): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    if (fields) {
      Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    }

    const url = `${API_URL}${API_PREFIX}${endpoint}`;
    const token = this.getAccessToken?.();

    const response = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        message: 'Upload failed',
        error: 'Error',
        timestamp: new Date().toISOString(),
        path: endpoint,
      }));
      throw error;
    }

    return response.json();
  }
}

/** 全局单例 */
export const apiClient = new ApiClient();
