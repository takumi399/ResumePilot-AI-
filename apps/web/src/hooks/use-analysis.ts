import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { HistoryItem, ATSScoreResult } from '@/types';

export function useAnalysisHistory(params?: { page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  return useQuery<{ items: HistoryItem[]; total: number; page: number; totalPages: number }>({
    queryKey: ['analysis', 'history', params],
    queryFn: () => apiClient.get(`/analysis/history?${searchParams.toString()}`),
    staleTime: 30 * 1000,
  });
}

export function useAnalysisResult(resumeId: string, jobId?: string) {
  return useQuery<ATSScoreResult>({
    queryKey: ['analysis', 'result', resumeId, jobId],
    queryFn: () => apiClient.get(`/analysis/${resumeId}${jobId ? `?jobId=${jobId}` : ''}`),
    enabled: !!resumeId,
  });
}
