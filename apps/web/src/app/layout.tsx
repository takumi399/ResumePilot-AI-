import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/providers';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'ResumePilot AI — AI 驱动的简历优化平台',
    template: '%s | ResumePilot AI',
  },
  description: '上传简历，输入职位描述，获取 ATS 评分和 AI 优化建议',
  keywords: ['简历优化', 'ATS评分', 'AI简历', '求职', '简历分析'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
