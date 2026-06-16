'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, Shield, Clock, LogOut, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  if (!user) return null;

  const roleLabels: Record<string, string> = {
    JOB_SEEKER: '求职者', RECRUITER: '招聘者', ADMIN: '管理员', SUPER_ADMIN: '超级管理员',
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">账户设置</h1>
        <p className="text-sm text-muted-foreground">管理你的个人信息和安全设置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">个人信息</CardTitle>
          <CardDescription>你的基本账户信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <User className="size-4 text-muted-foreground" />
            <div className="flex-1"><p className="text-sm font-medium">{user.name || '未设置'}</p><p className="text-xs text-muted-foreground">用户名</p></div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {user.emailVerified ? '✅ 已验证' : '⚠️ 未验证'}
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Shield className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{roleLabels[user.role] || user.role}</p>
              <p className="text-xs text-muted-foreground">账户角色</p>
            </div>
            <Badge variant={user.status === 'ACTIVE' ? 'default' : 'destructive'}>
              {user.status === 'ACTIVE' ? '正常' : user.status}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Clock className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{new Date(user.createdAt).toLocaleDateString('zh-CN')}</p>
              <p className="text-xs text-muted-foreground">注册时间</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Shield className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{user.mfaEnabled ? '已启用' : '未启用'}</p>
              <p className="text-xs text-muted-foreground">双因素认证 (MFA)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" /> 危险操作
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="mr-2 size-4" /> 退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
