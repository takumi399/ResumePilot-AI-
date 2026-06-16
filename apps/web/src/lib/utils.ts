import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return formatDate(date);
}

export function atsScoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-500';
  if (score >= 70) return 'text-blue-500';
  if (score >= 50) return 'text-amber-500';
  if (score >= 30) return 'text-orange-500';
  return 'text-red-500';
}

export function atsScoreBg(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export function atsRatingLabel(rating: string): string {
  const map: Record<string, string> = {
    excellent: '优秀', good: '良好', fair: '一般', poor: '需改进', fail: '不合格',
  };
  return map[rating] || rating;
}
