'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Search, Download, Calendar, MapPin, Monitor, Shield, AlertCircle, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import { CyberInput } from '@/components/ui/cyber/CyberInput';
import { CyberCard } from '@/components/ui/cyber/CyberCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/app/components/ui/pagination';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useLoginAuditLogs, LoginAuditFilters } from '@/features/audit-login/hooks';

export default function LoginAuditPage() {
  const {
    items,
    meta,
    loading,
    error,
    stats,
    filters,
    updateFilters,
    applyFilters,
    refetch
  } = useLoginAuditLogs();

  const safeItems = items ?? [];
  const safeMeta = meta ?? { total: 0, page: 1, pages: 0, has_next: false, has_prev: false };
  const safeStats = stats ?? { success: 0, failure: 0 };

  const [uiFilters, setUiFilters] = useState<LoginAuditFilters>({
    search: '',
    status: 'all',
    event_type: 'all',
    account_type: 'all',
  });

  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleFilterChange = useCallback((newFilters: Partial<LoginAuditFilters>) => {
    setUiFilters(prev => {
      const updated = { ...prev, ...newFilters };
      applyFilters(updated);
      return updated;
    });
  }, [applyFilters]);

  const handleSearch = useCallback((value: string) => {
    handleFilterChange({ search: value });
  }, [handleFilterChange]);

  const handleStatusChange = useCallback((value: 'all' | 'success' | 'failure') => {
    handleFilterChange({ status: value });
  }, [handleFilterChange]);

  const handleEventTypeChange = useCallback((value: string) => {
    handleFilterChange({ event_type: value });
  }, [handleFilterChange]);

  const handleAccountTypeChange = useCallback((value: string) => {
    handleFilterChange({ account_type: value });
  }, [handleFilterChange]);

  const handlePageChange = useCallback((page: number) => {
    updateFilters({ page });
  }, [updateFilters]);

  const handleSizeChange = useCallback((size: number) => {
    updateFilters({ size, page: 1 });
  }, [updateFilters]);

  const totalCount = safeMeta.total;

  const successCount = useMemo(() => {
    if (filters.result === 'success') return safeMeta.total;
    if (filters.result === 'failure') return 0;
    return safeStats.success;
  }, [filters.result, safeMeta.total, safeStats.success]);

  const failureCount = useMemo(() => {
    if (filters.result === 'failure') return safeMeta.total;
    if (filters.result === 'success') return 0;
    return safeStats.failure;
  }, [filters.result, safeMeta.total, safeStats.failure]);

  const normalizeStatus = useCallback((status: string | null | undefined) => {
    return (status ?? '').toLowerCase();
  }, []);

  const abnormalCount = useMemo(() => {
    return safeItems.filter(item => {
      const isFailure = normalizeStatus(item.status) === 'failure';
      const location = item.geo_location?.toString().toLowerCase() ?? '';
      const isRemote = location && !location.includes('本地') && !location.includes('local');
      return isFailure || isRemote;
    }).length;
  }, [safeItems, normalizeStatus]);

  const currentPage = safeMeta.page;
  const totalPages = safeMeta.pages;
  const hasNextPage = safeMeta.has_next;
  const hasPrevPage = safeMeta.has_prev;

  const getRoleDisplayName = useCallback((accountType: string | null | undefined): string => {
    if (!accountType) return '未知';
    return accountType;
  }, []);

  const eventTypeMap = useMemo<Record<string, string>>(() => ({
    login: '登录',
    logout: '登出',
    refresh: '刷新令牌',
    register: '注册',
  }), []);

  const getEventTypeLabel = useCallback((eventType: string | null | undefined): string => {
    if (!eventType) return '-';
    return eventTypeMap[eventType.toLowerCase()] || eventType;
  }, [eventTypeMap]);

  const formatTimestamp = useCallback((timestamp: string | null | undefined) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }, []);

  const escapeCsvValue = useCallback((value: string | number | null | undefined) => {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }, []);

  const handleExport = useCallback(() => {
    const header = ['用户名', '账户类型', '时间', '来源IP', '事件类型', '状态'];
    const rows = [
      header.map(escapeCsvValue).join(','),
      ...safeItems.map(log => ([
        log.username ?? '',
        log.account_type ?? '',
        log.timestamp ?? '',
        log.source_ip ?? '',
        log.event_type ?? '',
        log.status ?? '',
      ].map(escapeCsvValue).join(',')))
    ];
    const csvContent = rows.join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `登录审计-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [safeItems, escapeCsvValue]);

  const paginationPages = useMemo<(number | 'ellipsis')[]>(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, 'ellipsis', totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-900">
        <div className="text-center">
          <AlertCircle size={36} className="text-red-500 mx-auto mb-3" />
          <p className="text-[13px] text-slate-500 mb-4">加载失败：{error.message}</p>
          <CyberButton onClick={refetch}>重试</CyberButton>
        </div>
      </div>
    );
  }

  // ─── Main ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen space-y-4 p-4">
      <div className="filter-bar-container flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <CyberInput
              type="text"
              placeholder="搜索 IP 地址..."
              value={uiFilters.search || ''}
              onChange={(e) => handleSearch(e.target.value)}
              className="filter-input h-9 w-56 pl-9 pr-3 text-[13px]"
            />
          </div>

          <Select
            value={uiFilters.status || 'all'}
            onValueChange={(value) => handleStatusChange(value as 'all' | 'success' | 'failure')}
          >
            <SelectTrigger className="filter-input h-9 w-32 text-[13px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="failure">失败</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={uiFilters.event_type || 'all'}
            onValueChange={(value) => handleEventTypeChange(value)}
          >
            <SelectTrigger className="filter-input h-9 w-32 text-[13px]">
              <SelectValue placeholder="全部事件" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部事件</SelectItem>
              <SelectItem value="login">登录</SelectItem>
              <SelectItem value="logout">登出</SelectItem>
              <SelectItem value="refresh">刷新</SelectItem>
              <SelectItem value="register">注册</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={uiFilters.account_type || 'all'}
            onValueChange={(value) => handleAccountTypeChange(value)}
          >
            <SelectTrigger className="filter-input h-9 w-36 text-[13px]">
              <SelectValue placeholder="全部账户类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账户类型</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
              <SelectItem value="operator">运营</SelectItem>
              <SelectItem value="analyst">分析师</SelectItem>
              <SelectItem value="api">API账号</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <CyberButton
          onClick={handleExport}
          className="h-9 shrink-0 border border-white/30 bg-transparent px-3 text-[13px] text-slate-100 hover:bg-white/10"
        >
          <Download size={14} />
          导出日志
        </CyberButton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* 日志条数 */}
        <CyberCard className="px-5 py-4 flex items-center justify-between hover:border-blue-400 dark:hover:border-blue-500 transition-colors rounded-sm">
          <div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-1 tracking-wide">总日志条数</p>
            <p className="text-[28px] font-semibold text-slate-800 dark:text-white leading-none font-mono">{totalCount}</p>
          </div>
          <div className="w-10 h-10 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Shield size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
        </CyberCard>

        {/* 成功次数 */}
        <CyberCard className="px-5 py-4 flex items-center justify-between hover:border-green-400 dark:hover:border-green-500 transition-colors rounded-sm">
          <div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-1 tracking-wide">成功次数</p>
            <p className="text-[28px] font-semibold text-green-600 dark:text-green-400 leading-none font-mono">{successCount}</p>
          </div>
          <div className="w-10 h-10 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
          </div>
        </CyberCard>

        {/* 失败次数 */}
        <CyberCard className="px-5 py-4 flex items-center justify-between hover:border-red-400 dark:hover:border-red-500 transition-colors rounded-sm">
          <div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-1 tracking-wide">失败次数</p>
            <p className="text-[28px] font-semibold text-red-500 dark:text-red-400 leading-none font-mono">{failureCount}</p>
          </div>
          <div className="w-10 h-10 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <XCircle size={18} className="text-red-500 dark:text-red-400" />
          </div>
        </CyberCard>

        {/* 异常次数 */}
        <CyberCard className="px-5 py-4 flex items-center justify-between hover:border-orange-400 dark:hover:border-orange-500 transition-colors rounded-sm">
          <div>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mb-1 tracking-wide">异常次数</p>
            <p className="text-[28px] font-semibold text-orange-500 dark:text-orange-400 leading-none font-mono">{abnormalCount}</p>
          </div>
          <div className="w-10 h-10 rounded bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <AlertCircle size={18} className="text-orange-500 dark:text-orange-400" />
          </div>
        </CyberCard>
      </div>

      <div className="overflow-hidden rounded-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                {['用户信息', '登录时间', '来源位置', '事件类型', '状态', '操作'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-[12px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: Math.min(filters.size || 20, 5) }).map((_, index) => (
                  <tr key={`loading-${index}`} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, cellIndex) => (
                      <td key={`loading-cell-${cellIndex}`} className="px-4 py-3">
                        <Skeleton className="h-4 w-[80%] bg-slate-200 dark:bg-slate-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : safeItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <AlertCircle size={22} className="text-slate-300 dark:text-slate-600" />
                      </div>
                      <p className="text-[13px] text-slate-400">暂无符合条件的审计日志</p>
                      <p className="text-[12px] text-slate-300 dark:text-slate-600">请尝试调整筛选条件</p>
                    </div>
                  </td>
                </tr>
              ) : (
                safeItems.map((log) => (
                  <React.Fragment key={log.id}>
                    {/* 主行 */}
                    <tr
                      className={`border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors duration-100
                        hover:bg-blue-50/60 dark:hover:bg-blue-500/5
                        ${expandedRow === log.id ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      {/* 用户信息 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 ${
                            log.account_type === 'admin' ? 'bg-purple-500' :
                            log.account_type === 'operator' ? 'bg-blue-500' :
                            log.account_type === 'analyst' ? 'bg-emerald-500' :
                            'bg-slate-400'
                          }`}>
                            {log.username ? String(log.username).charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{String(log.username || 'Unknown')}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{String(log.user_id || '-')}</div>
                            <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${
                              log.account_type === 'admin' || log.account_type === 'superadmin'
                                ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400'
                                : log.account_type === 'operator'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                : log.account_type === 'analyst'
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}>
                              {getRoleDisplayName(log.account_type as string | null | undefined)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 时间 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-400">
                          <Calendar size={12} className="text-slate-300 dark:text-slate-600 shrink-0" />
                          <span className="font-mono text-[12px]">{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </td>

                      {/* 来源位置 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[13px] text-slate-700 dark:text-slate-300">
                          <MapPin size={12} className="text-slate-300 dark:text-slate-600 shrink-0" />
                          <span>{log.geo_location || '-'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 pl-[18px]">{log.source_ip || '-'}</div>
                      </td>

                      {/* 事件类型 */}
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-slate-700 dark:text-slate-300">{getEventTypeLabel(log.event_type as string | null | undefined)}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{log.event_type || '-'}</div>
                      </td>

                      {/* 状态 */}
                      <td className="px-4 py-3">
                        {normalizeStatus(log.status) === 'success' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-green-50 text-green-600 border border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20">
                            <CheckCircle size={12} />
                            成功
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-red-50 text-red-500 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                              <XCircle size={12} />
                              失败
                            </span>
                            {log.error_code && (
                              <div className="text-[11px] text-red-400 dark:text-red-400/70 font-mono mt-1">
                                {log.error_code}: {log.reason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 操作 */}
                      <td className="px-4 py-3">
                        <button
                          className={`inline-flex items-center gap-1 text-[13px] transition-colors ${
                            expandedRow === log.id
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                          }`}
                        >
                          详情
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${expandedRow === log.id ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </td>
                    </tr>

                    {/* 展开行 */}
                    {expandedRow === log.id && (
                      <tr className="bg-slate-50/80 dark:bg-slate-900">
                        <td colSpan={6} className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-stretch gap-0 border-l-2 border-blue-500 pl-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                              {/* 设备信息 */}
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <Monitor size={14} className="text-blue-500" />
                                  <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">设备信息</span>
                                </div>
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm p-3">
                                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">用户代理</div>
                                  <div className="text-[12px] text-slate-700 dark:text-slate-300 font-mono break-all leading-relaxed">{log.user_agent || '-'}</div>
                                </div>
                              </div>

                              {/* 会话追踪 */}
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <Shield size={14} className="text-purple-500" />
                                  <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">会话追踪</span>
                                </div>
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">原始时间戳</span>
                                    <span className="text-[12px] text-slate-700 dark:text-slate-300 font-mono">{log.timestamp || '-'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          {/* 左侧：条数 + 每页 */}
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
            <span>共 {totalCount} 条</span>
            <div className="flex items-center gap-1">
              <span>每页</span>
              <Select
                value={filters.size?.toString() || '20'}
                onValueChange={(val) => handleSizeChange(parseInt(val, 10))}
              >
                <SelectTrigger className="h-8 min-w-[50px] px-2 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-lg">
                  {[10, 20, 50, 100].map(size => (
                    <SelectItem key={size} value={size.toString()} className="cursor-pointer">
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>条</span>
            </div>
          </div>

          {/* 右侧：分页 */}
          {totalPages > 0 && (
            <Pagination className="mx-0">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={(e) => { e.preventDefault(); if (hasPrevPage) handlePageChange(currentPage - 1); }}
                    aria-disabled={!hasPrevPage}
                    className={!hasPrevPage ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}
                  />
                </PaginationItem>

                {paginationPages.map((p, i) => (
                  <PaginationItem key={i}>
                    {p === 'ellipsis' ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={currentPage === p}
                        onClick={(e) => { e.preventDefault(); handlePageChange(p as number); }}
                        className={currentPage === p ? "bg-cyan-500 text-white hover:bg-cyan-600 cursor-pointer" : "hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"}
                      >
                        {p}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={(e) => { e.preventDefault(); if (hasNextPage) handlePageChange(currentPage + 1); }}
                    aria-disabled={!hasNextPage}
                    className={!hasNextPage ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>
    </div>
  );
}
