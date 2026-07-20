'use client';

import React, { useEffect, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataSourceTable } from './DataSourceTable';
import { DataSourceForm } from '../DataSourceForm';
import { useDataSources } from '../../hooks/useDataSources';
import { useCreateDataSource } from '../../hooks/useCreateDataSource';
import { useUpdateDataSource } from '../../hooks/useUpdateDataSource';
import { useDeleteDataSource } from '../../hooks/useDeleteDataSource';
import { DataSourceType, DataSourceStatus, DataSourceCreate, DataSource } from '../../services/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { DeleteConfirmDialog } from '@/app/(main)/admin/_components/common/DeleteConfirmDialog';
import { useQueryState } from '@/app/(main)/admin/_components/common/QueryState';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

interface DataSourceQuery {
  page: number;
  size: number;
  name?: string;
  source_type?: string;
  status?: string;
}

const dataSourceQueryCodec = {
  parse: (sp: URLSearchParams) => ({
    page: Number(sp.get('page')) || 1,
    size: Number(sp.get('size')) || 10,
    name: sp.get('name') || undefined,
    source_type: sp.get('source_type') || 'all',
    status: sp.get('status') || 'all',
  }),
  serialize: (state: DataSourceQuery) => ({
    page: state.page?.toString(),
    size: state.size?.toString(),
    name: state.name,
    source_type: state.source_type === 'all' ? undefined : state.source_type,
    status: state.status === 'all' ? undefined : state.status,
  }),
  resetPageOnChangeKeys: ['name', 'source_type', 'status', 'size'] as ('name' | 'source_type' | 'status' | 'size')[],
};

export function DataSourceList() {
  const [query, setQuery] = useQueryState(dataSourceQueryCodec);
  const { data, loading, error } = useDataSources({
    ...query,
    source_type: query.source_type === 'all' ? undefined : query.source_type as DataSourceType,
    status: query.status === 'all' ? undefined : query.status as DataSourceStatus,
  });
  const { create, loading: creating } = useCreateDataSource();
  const { update, loading: updating } = useUpdateDataSource();
  const { remove, loading: deleting } = useDeleteDataSource();

  const [searchText, setSearchText] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState<DataSource | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const filters = query;

  useEffect(() => {
    setMounted(true);
    setSearchText(query.name || '');
  }, [query.name]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchText(value);
    setQuery({ name: value || undefined, page: 1 });
  };

  const handleTypeChange = (value: string) => {
    setQuery({ source_type: value === 'all' ? undefined : value as DataSourceType, page: 1 });
  };

  const handleStatusChange = (value: string) => {
    setQuery({ status: value === 'all' ? undefined : value as DataSourceStatus, page: 1 });
  };

  const handleCreate = async (formData: DataSourceCreate) => {
    try {
      await create(formData);
      toast.success('数据源创建成功');
      setIsCreateOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '创建数据源失败';
      toast.error(message);
      console.error(error);
    }
  };

  const handleUpdate = async (formData: DataSourceCreate) => {
    if (!editingId) {
      return;
    }
    try {
      await update(editingId, formData);
      toast.success('数据源更新成功');
      setEditingId(null);
      setEditingSource(undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '更新数据源失败';
      toast.error(message);
      console.error(error);
    }
  };

  const handleEditClick = (id: number) => {
    const source = data?.items?.find(item => item.id === id);
    if (!source) {
      return;
    }
    setEditingSource(source);
    setEditingId(id);
  };

  const handleDeleteClick = (id: number) => {
    setSourceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!sourceToDelete) {
      return;
    }
    try {
      await remove(sourceToDelete);
      toast.success('数据源删除成功');
      setDeleteDialogOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '删除数据源失败';
      toast.error(message);
      console.error(error);
    }
  };

  const handlePageChange = (page: number) => {
    setQuery({ page });
  };

  const handleSizeChange = (size: number) => {
    setQuery({ size, page: 1 });
  };

  return (
    <div className="bg-transparent p-6 text-foreground space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">数据源管理</h2>

        <CyberButton
          onClick={() => setIsCreateOpen(true)}
          className="shadow-lg shadow-cyan-500/20 group"
        >
          <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          添加数据源
        </CyberButton>
      </div>

      <div className="filter-bar-container flex flex-wrap items-center gap-3">
        <Select value={mounted ? (filters.source_type || 'all') : 'all'} onValueChange={handleTypeChange}>
          <SelectTrigger className="filter-input w-[160px]">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="DOUYIN_API">抖音 API</SelectItem>
            <SelectItem value="DOUYIN_SHOP">抖音小店</SelectItem>
            <SelectItem value="DOUYIN_APP">抖音 App</SelectItem>
            <SelectItem value="FILE_UPLOAD">文件上传</SelectItem>
            <SelectItem value="SELF_HOSTED">自托管</SelectItem>
            <SelectItem value="FILE_IMPORT">文件导入</SelectItem>
          </SelectContent>
        </Select>

        <Select value={mounted ? (filters.status || 'all') : 'all'} onValueChange={handleStatusChange}>
          <SelectTrigger className="filter-input w-[140px]">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="ACTIVE">启用</SelectItem>
            <SelectItem value="INACTIVE">停用</SelectItem>
            <SelectItem value="ERROR">错误</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="搜索数据源..."
            value={searchText}
            onChange={handleSearch}
            className="filter-input h-9 w-[240px] pl-10 pr-4 text-sm focus-visible:ring-0"
          />
        </div>
      </div>

      <DataSourceTable
        data={data?.items || []}
        loading={loading || deleting}
        error={error?.message ?? null}
        pagination={{ page: data?.meta?.page || 1, size: data?.meta?.size || 10, total: data?.meta?.total || 0 }}
        onPageChange={handlePageChange}
        onSizeChange={handleSizeChange}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>添加新数据源</DialogTitle>
          </DialogHeader>
          <DataSourceForm
            onSubmit={handleCreate}
            loading={creating}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>编辑数据源</DialogTitle>
          </DialogHeader>
          {editingSource && (
            <DataSourceForm
              initialData={editingSource}
              onSubmit={handleUpdate}
              loading={updating}
              onCancel={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        isLoading={deleting}
        title="确认删除数据源？"
        description="此操作不可撤销，将永久删除该数据源及其关联配置。"
      />
    </div>
  );
}
