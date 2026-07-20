'use client';

import React from 'react';
import { DataTable, DataTableColumn } from '../../_components/common/DataTable';
import { UserActions } from './UserActions';
import { User } from '@/types/user';
import { Badge } from '@/app/components/ui/badge';
import { format } from 'date-fns';

interface UserTableProps {
  data: User[];
  isLoading: boolean;
  pagination: { page: number; size: number; total: number };
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  selectedKeys: (string | number)[];
  onSelectionChange: (keys: (string | number)[]) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onAssignRoles: (user: User) => void;
  onResetPassword: (user: User) => void;
}

export function UserTable({
  data,
  isLoading,
  pagination,
  onPageChange,
  onSizeChange,
  selectedKeys,
  onSelectionChange,
  onEdit,
  onDelete,
  onAssignRoles,
  onResetPassword
}: UserTableProps) {
  const columns: DataTableColumn<User>[] = [
    {
      key: 'username',
      header: '用户名',
      render: (user) => <span className="font-mono font-medium text-cyan-600 dark:text-cyan-300">{user.username}</span>,
    },
    {
      key: 'email',
      header: '邮箱',
      render: (user) => <span className="text-slate-500 dark:text-slate-400">{user.email}</span>,
    },
    {
      key: 'roles',
      header: '角色',
      render: (user) => {
          // 超级管理员优先显示
          if (user.is_superuser) {
              return <Badge variant="default" className="bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/50 dark:shadow-[0_0_10px_rgba(168,85,247,0.2)] hover:bg-purple-200 dark:hover:bg-purple-500/20 transition-all">超级管理员</Badge>
          }
          // 如果有分配的角色，显示角色名称
          if (user.roles && user.roles.length > 0) {
              return (
                  <div className="flex gap-1 flex-wrap">
                      {user.roles.map(role => (
                          <Badge
                              key={role.id}
                              variant="outline"
                              className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700"
                          >
                              {role.name}
                          </Badge>
                      ))}
                  </div>
              );
          }
          // 默认显示普通用户
          return <Badge variant="secondary" className="bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">普通用户</Badge>
      },
    },
    {
      key: 'is_active',
      header: '状态',
      render: (user) => (
        <Badge variant={user.is_active ? 'outline' : 'destructive'} className={
            user.is_active 
            ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/50 dark:shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:bg-emerald-200 dark:hover:bg-emerald-500/20 transition-all" 
            : "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/50 dark:shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:bg-red-200 dark:hover:bg-red-500/20 transition-all"
        }>
          {user.is_active ? '正常' : '禁用'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: '注册时间',
      render: (user) => {
        if (!user.created_at) return '-';
        try {
            return <span className="font-mono text-xs text-slate-500">{format(new Date(user.created_at), 'yyyy-MM-dd HH:mm')}</span>;
        } catch {
            return user.created_at;
        }
      },
    },
    {
      key: 'actions',
      header: '操作',
      width: 50,
      render: (user) => (
        <UserActions
          user={user}
          onEdit={onEdit}
          onDelete={onDelete}
          onAssignRoles={onAssignRoles}
          onResetPassword={onResetPassword}
        />
      ),
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={isLoading}
      pagination={pagination}
      onPageChange={onPageChange}
      onSizeChange={onSizeChange}
      rowKey={(user) => user.id}
      rowSelection={{
        selectedKeys,
        onChange: onSelectionChange,
      }}
    />
  );
}
