// ============================================================================
// Resume React Query Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ResumeItem, ResumeListResponse, UploadResumeResponse } from '@/types';
import { useAuthStore } from '@/stores/auth-store';

export function useResumeList(params?: {
  page?: number;
  limit?: number;
  parseStatus?: string;
  search?: string;
  includeArchived?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.parseStatus) searchParams.set('parseStatus', params.parseStatus);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.includeArchived) searchParams.set('includeArchived', 'true');

  return useQuery<ResumeListResponse>({
    queryKey: ['resumes', params],
    queryFn: () => apiClient.get(`/resumes?${searchParams.toString()}`),
    staleTime: 30 * 1000,
  });
}

export function useResumeDetail(id: string, opts?: { includeDownloadUrl?: boolean }) {
  const query = opts?.includeDownloadUrl ? '?download=true' : '';
  return useQuery<ResumeItem>({
    queryKey: ['resumes', id, opts],
    queryFn: () => apiClient.get(`/resumes/${id}${query}`),
    enabled: !!id,
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) =>
      apiClient.upload<UploadResumeResponse>('/resumes/upload', file, title ? { title } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, permanent }: { id: string; permanent?: boolean }) =>
      apiClient.delete(`/resumes/${id}${permanent ? '?permanent=true' : ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });
}

export function useUpdateResume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; isPrimary?: boolean; isArchived?: boolean }) =>
      apiClient.patch<ResumeItem>(`/resumes/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['resumes', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });
}
