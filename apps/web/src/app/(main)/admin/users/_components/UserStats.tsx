'use client';

import React from 'react';
import { UserStatsResponse } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Users, UserCheck, UserX, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';

interface UserStatsProps {
  stats: UserStatsResponse;
  isLoading?: boolean;
}

export function UserStats({ stats, isLoading }: UserStatsProps) {
  const items = [
    {
      title: '总用户数',
      value: stats.total,
      icon: Users,
      description: '所有注册用户',
    },
    {
      title: '活跃用户',
      value: stats.active,
      icon: UserCheck,
      description: '当前状态正常的用户',
      className: 'text-green-600',
    },
    {
      title: '停用用户',
      value: stats.inactive,
      icon: UserX,
      description: '已被禁用的用户',
      className: 'text-red-600',
    },
    {
      title: '超级管理员',
      value: stats.superusers,
      icon: ShieldCheck,
      description: '拥有最高权限',
      className: 'text-cyan-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card key={index} className="bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-slate-800/60 hover:border-cyan-500/50 dark:hover:border-cyan-500/30 transition-all duration-300 group shadow-sm dark:shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {item.title}
              </CardTitle>
              <Icon className={`h-4 w-4 transition-colors ${item.className || 'text-cyan-600 dark:text-cyan-500/70 group-hover:text-cyan-500 dark:group-hover:text-cyan-400'}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16 bg-slate-100 dark:bg-slate-800" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 dark:text-white dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{item.value}</div>
              )}
              <p className="text-xs text-slate-500 mt-1 font-light">
                {item.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
