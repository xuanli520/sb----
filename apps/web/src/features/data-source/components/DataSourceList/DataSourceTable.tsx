'use client';

import React from 'react';
import { DataSource } from '../../services/types';
import { DataTable, DataTableColumn } from '@/app/(main)/admin/_components/common/DataTable';
import { StatusTag } from '../common/StatusTag';
import { TypeTag } from '../common/TypeTag';
import { useRouter } from 'next/navigation';
import { getDataSourceTypeLabel } from '@/lib/enums';

interface DataSourceTableProps {
  data: DataSource[];
  loading: boolean;
  error?: string | null;
  pagination: { page: number; size: number; total: number };
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function DataSourceTable({ data, loading, error, pagination, onPageChange, onSizeChange, onEdit, onDelete }: DataSourceTableProps) {
  const router = useRouter();

  const columns: DataTableColumn<DataSource>[] = [
    {
      key: 'name',
      header: '名称',
      render: (source) => (
        <div className="flex items-center gap-3">
          <TypeTag type={source.type} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {source.name}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: '类型',
      render: (source) => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {getDataSourceTypeLabel(source.type)}
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (source) => <StatusTag status={source.status} />,
    },
    {
      key: 'actions',
      header: '操作',
      render: (source) => (
        <div className="flex items-center gap-4 text-sm font-mono">
          <button
            onClick={() => router.push(`/data-source/${source.id}`)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline decoration-indigo-500/50 underline-offset-4"
          >
            查看
          </button>
          <button
            onClick={() => onEdit(source.id)}
            className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 hover:underline decoration-cyan-500/50 underline-offset-4"
          >
            编辑
          </button>
          <button
            onClick={() => onDelete(source.id)}
            className="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300 hover:underline decoration-rose-500/50 underline-offset-4"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={loading}
      error={error}
      pagination={pagination}
      onPageChange={onPageChange}
      onSizeChange={onSizeChange}
      rowKey={(source) => source.id}
      virtualScroll={{
        enabled: data.length > 20, // 当数据超过20条时启用虚拟滚动
        rowHeight: 64,
        tableHeight: 600,
        overscan: 5,
      }}
    />
  );
}
