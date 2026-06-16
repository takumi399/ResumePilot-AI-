// ============================================================================
// Auth React Query Hooks
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LoginRequest, RegisterRequest, AuthResponse, UserProfile } from '@/types';
import { useAuthStore } from '@/stores/auth-store';

// ========================================================================
// Queries
// ========================================================================

export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get('/auth/me'),
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });
}

// ========================================================================
// Mutations
// ========================================================================

export function useLogin() {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: LoginRequest) =>
      apiClient.post<AuthResponse>('/auth/login', data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      queryClient.setQueryData(['auth', 'me'], data.user);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: RegisterRequest) =>
      apiClient.post<AuthResponse>('/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      queryClient.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });
}
