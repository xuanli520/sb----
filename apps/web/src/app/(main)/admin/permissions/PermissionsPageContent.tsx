'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPermissions, PermissionListParams } from '@/services/adminService';
import { PermissionRead } from '@/types';
import { CyberCard } from '@/components/ui/cyber/CyberCard';
import { CyberInput } from '@/components/ui/cyber/CyberInput';
import { CyberBadge } from '@/components/ui/cyber/CyberBadge';
import { DataTable, DataTableColumn } from '../_components/common/DataTable';
import { Search, Lock, Copy, Key } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryState, QueryCodec } from '../_components/common/QueryState';

const MODULE_NAME_MAP: Record<string, string> = {
  user: '用户',
  role: '角色',
  permission: '权限',
  data: '数据',
  report: '报告',
  settings: '设置',
  system: '系统',
};

const SEARCH_INPUT_ID = 'permission-search';
const UNKNOWN_MODULE_NAME = '其他';

const permissionQueryCodec: QueryCodec<PermissionListParams> = {
  parse: (sp) => ({
    page: Number(sp.get('page')) || 1,
    size: Number(sp.get('size')) || 10,
    name: sp.get('name') || undefined,
    module: sp.get('module') || undefined,
  }),
  serialize: (state) => ({
    page: state.page?.toString(),
    size: state.size?.toString(),
    name: state.name,
    module: state.module,
  }),
  resetPageOnChangeKeys: ['name', 'module', 'size'],
};

function getModuleName(module?: string) {
  if (!module) {
    return MODULE_NAME_MAP.system;
  }

  return MODULE_NAME_MAP[module] ?? UNKNOWN_MODULE_NAME;
}

function isValidPermissionsResponse(data: unknown): data is { items: PermissionRead[]; meta: { total: number } } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const response = data as { items?: unknown; meta?: { total?: unknown } };
  return Array.isArray(response.items) && typeof response.meta?.total === 'number';
}

export function PermissionsPageContent() {
  const [query, setQuery] = useQueryState(permissionQueryCodec);
  const [permissions, setPermissions] = useState<PermissionRead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState(query.name || '');
  const isComposingRef = useRef(false);
  const queryNameRef = useRef(query.name || '');

  queryNameRef.current = query.name || '';

  const normalizedQuery = useMemo(
    () => ({
      page: query.page,
      size: query.size,
      module: query.module,
      name: query.name?.trim() || undefined,
    }),
    [query.module, query.name, query.page, query.size]
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    getPermissions(normalizedQuery)
      .then((data) => {
        if (cancelled) {
          return;
        }

        if (!isValidPermissionsResponse(data)) {
          throw new Error('Invalid permissions response');
        }

        setPermissions(data.items);
        setTotal(data.meta.total);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        toast.error('加载权限数据失败');
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedQuery]);

  useEffect(() => {
    if (!isComposingRef.current) {
      setSearchText(query.name || '');
    }
  }, [query.name]);

  const applySearch = useCallback((value: string) => {
    const nextValue = value.trim();

    if (nextValue === queryNameRef.current) {
      return;
    }

    setQuery({
      name: nextValue || undefined,
      module: undefined,
      page: 1,
    });
  }, [setQuery]);

  useEffect(() => {
    if (isComposingRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      applySearch(searchText);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [applySearch, searchText]);

  const copyWithFallback = useCallback((text: string) => {
    if (typeof document.execCommand !== 'function') {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          if (!copyWithFallback(text)) {
            throw new Error('copy_failed');
          }
        }
      } else if (!copyWithFallback(text)) {
        throw new Error('copy_failed');
      }

      toast.success('已复制到剪贴板');
    } catch (error) {
      console.error(error);
      toast.error('复制失败，请手动复制');
    }
  }, [copyWithFallback]);

  const handlePageChange = useCallback((newPage: number) => {
    setQuery({ page: newPage });
  }, [setQuery]);

  const handleSizeChange = useCallback((newSize: number) => {
    setQuery({ size: newSize, page: 1 });
  }, [setQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
  }, []);

  const columns = useMemo<DataTableColumn<PermissionRead>[]>(() => [
    {
      key: 'id',
      header: 'ID',
      render: (perm) => (
        <span className="text-slate-500 dark:text-slate-600">#{perm.id}</span>
      ),
    },
    {
      key: 'module',
      header: '模块',
      render: (perm) => (
        <CyberBadge
          variant="outline"
          className="uppercase tracking-wider text-[10px]"
          title={MODULE_NAME_MAP[perm.module] ? undefined : perm.module}
        >
          {getModuleName(perm.module)}
        </CyberBadge>
      ),
    },
    {
      key: 'code',
      header: '代码',
      render: (perm) => (
        <div className="flex items-center gap-2 font-mono text-cyan-600 dark:text-cyan-400">
          <span>{perm.code}</span>
          <button
            type="button"
            onClick={() => handleCopy(perm.code)}
            className="rounded p-1 transition-colors hover:bg-cyan-100 dark:hover:bg-cyan-900/30"
            aria-label={`复制权限代码 ${perm.code}`}
            title="复制"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
    {
      key: 'name',
      header: '名称',
      render: (perm) => (
        <span className="font-medium text-slate-900 dark:text-white">{perm.name}</span>
      ),
    },
    {
      key: 'description',
      header: '描述',
      render: (perm) => (
        <span className="text-slate-500 dark:text-slate-400">{perm.description || '-'}</span>
      ),
    },
  ], [handleCopy]);

  return (
    <div className="min-h-screen space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground dark:text-slate-400">
            <Key className="h-4 w-4" aria-hidden="true" />
            系统访问控制定义
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CyberCard className="flex items-center space-x-4 p-4">
          <div className="rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">权限总数</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{total}</p>
          </div>
        </CyberCard>

        <CyberCard className="flex items-center p-4 md:col-span-2">
          <div className="relative w-full">
            <label htmlFor={SEARCH_INPUT_ID} className="sr-only">搜索权限名称</label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <CyberInput
              id={SEARCH_INPUT_ID}
              placeholder="搜索权限名称..."
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false;
                const value = e.currentTarget.value;
                handleSearchChange(value);
                applySearch(value);
              }}
              className="pl-10"
            />
          </div>
        </CyberCard>
      </div>

      <DataTable
        data={permissions}
        columns={columns}
        isLoading={loading}
        pagination={{ page: query.page || 1, size: query.size || 10, total }}
        onPageChange={handlePageChange}
        onSizeChange={handleSizeChange}
        rowKey={(perm) => perm.id}
      />
    </div>
  );
}
