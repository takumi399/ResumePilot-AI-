// ============================================================================
// Auth Store — Zustand (Client-side state)
// ============================================================================
//
// 设计决策:
//   1. Access Token → 仅存储在内存 (Zustand)，不持久化到 localStorage
//     理由: XSS 防护，token 不会暴露给 document.cookie / localStorage API
//   2. Refresh Token → HttpOnly Cookie，JS 完全不可访问
//   3. User Profile → 持久化到 sessionStorage (页面刷新后恢复 UI 状态)
//   4. persist middleware → 自动同步到 sessionStorage
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserProfile } from '@/types';

interface AuthState {
  accessToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (token: string, user: UserProfile) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: UserProfile) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (token, user) =>
        set({ accessToken: token, user, isAuthenticated: true, isLoading: false }),

      setAccessToken: (token) => set({ accessToken: token }),

      setUser: (user) => set({ user }),

      setLoading: (loading) => set({ isLoading: loading }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: 'resumepilot-auth',
      storage: createJSONStorage(() => sessionStorage),
      // 只持久化 user，不持久化 accessToken (安全考虑)
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
