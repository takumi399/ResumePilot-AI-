'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import {
  LayoutDashboard, FileText, Briefcase, History, Settings,
  ChevronLeft, LogOut, User, Sparkles, Upload, Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** 侧边栏导航定义 */
const NAV_ITEMS = [
  { href: '/dashboard', label: '仪表盘', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/resumes', label: '我的简历', icon: FileText },
  { href: '/dashboard/jobs', label: '岗位管理', icon: Briefcase },
  { href: '/dashboard/history', label: '分析历史', icon: History },
  { href: '/dashboard/settings', label: '账户设置', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* ================================================================ */}
      {/* 侧边栏 */}
      {/* ================================================================ */}
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="size-5 text-primary shrink-0" />
            {!collapsed && <span>ResumePilot</span>}
          </Link>
        </div>

        {/* 导航 */}
        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* 折叠按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="mx-auto mb-2"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </aside>

      {/* ================================================================ */}
      {/* 主区域 */}
      {/* ================================================================ */}
      <div className="flex flex-1 flex-col">
        {/* 顶部栏 */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-6">
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
          </Button>
          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">
                    {user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm md:inline">{user?.name || user?.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="cursor-pointer">
                  <User className="mr-2 size-4" /> 个人设置
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onClick={() => logout.mutate()}
              >
                <LogOut className="mr-2 size-4" /> 退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
