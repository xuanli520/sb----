'use client';

import React from 'react';
import { RoleRead, RoleWithPermissions } from '@/types';
import { DataTable, DataTableColumn } from '../_components/common/DataTable';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import { CyberBadge } from '@/components/ui/cyber/CyberBadge';
import { Edit2, Trash2, Key } from 'lucide-react';

interface RoleTableProps {
  data: RoleWithPermissions[];
  loading: boolean;
  pagination: { page: number; size: number; total: number };
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onEdit: (role: RoleRead) => void;
  onDelete: (role: RoleRead) => void;
  onAssignPermissions: (role: RoleWithPermissions) => void;
}

export function RoleTable({ data, loading, pagination, onPageChange, onSizeChange, onEdit, onDelete, onAssignPermissions }: RoleTableProps) {
  const columns: DataTableColumn<RoleWithPermissions>[] = [
    {
      key: 'name',
      header: '角色名称',
      render: (role) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 dark:text-white">{role.name}</span>
          {role.is_system && (
            <span className="text-[10px] text-slate-400 uppercase border border-slate-200 dark:border-slate-700 px-1 rounded">
              系统
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      header: '描述',
      render: (role) => (
        <span className="text-slate-500 dark:text-slate-400">{role.description || '-'}</span>
      ),
    },
    {
      key: 'permissions',
      header: '权限',
      render: (role) => (
        <CyberBadge variant="default">
          {(role.permissions?.length || 0)} 访问点
        </CyberBadge>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: () => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
          <span className="text-xs text-slate-600 dark:text-slate-300">已激活</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      render: (role) => (
        <div className="flex items-center gap-2">
          <CyberButton size="sm" variant="ghost" onClick={() => onAssignPermissions(role)} title="管理权限">
            <Key className="w-4 h-4 text-amber-500" />
          </CyberButton>
          <CyberButton size="sm" variant="ghost" onClick={() => onEdit(role)} title="编辑角色">
            <Edit2 className="w-4 h-4 text-blue-500" />
          </CyberButton>
          {!role.is_system && (
            <CyberButton size="sm" variant="ghost" onClick={() => onDelete(role)} title="删除角色">
              <Trash2 className="w-4 h-4 text-red-500" />
            </CyberButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={loading}
      rowKey={(role) => role.id}
    />
  );
}
