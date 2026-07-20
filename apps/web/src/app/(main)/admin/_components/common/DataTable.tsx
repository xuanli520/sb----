'use client';

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/app/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Checkbox } from '@/app/components/ui/checkbox';
import { EmptyState } from './EmptyState';
import { Skeleton } from '@/app/components/ui/skeleton';
import { cn } from '@/app/components/ui/utils';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: number | string;
};

export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  isLoading?: boolean;
  error?: string | null;
  pagination?: { page: number; size: number; total: number };
  onPageChange?: (page: number) => void;
  onSizeChange?: (size: number) => void;
  rowKey: (row: T) => string | number;
  rowSelection?: {
    selectedKeys: Array<string | number>;
    onChange: (keys: Array<string | number>) => void;
  };
  toolbar?: React.ReactNode;
  className?: string;
  virtualScroll?: {
    enabled: boolean;
    rowHeight?: number;
    tableHeight?: number;
    overscan?: number;
  };
};

export function DataTable<T>({
  data,
  columns,
  isLoading,
  error,
  pagination,
  onPageChange,
  onSizeChange,
  rowKey,
  rowSelection,
  toolbar,
  className,
  virtualScroll = { enabled: false }
}: DataTableProps<T>) {
  // 防御性计算，避免 NaN 或 Infinity
  const safeTotal = pagination?.total || 0;
  const safeSize = pagination?.size || 10;
  const safePage = pagination?.page || 1;
  const totalPages = safeSize > 0 ? Math.ceil(safeTotal / safeSize) : 0;

  const handleSelectAll = (checked: boolean) => {
    if (!rowSelection) return;
    if (checked) {
      rowSelection.onChange((data || []).map(row => rowKey(row)));
    } else {
      rowSelection.onChange([]);
    }
  };

  const handleSelectRow = (key: string | number, checked: boolean) => {
    if (!rowSelection) return;
    if (checked) {
      rowSelection.onChange([...rowSelection.selectedKeys, key]);
    } else {
      rowSelection.onChange(rowSelection.selectedKeys.filter(k => k !== key));
    }
  };

  const isAllSelected = rowSelection && (data || []).length > 0 && (data || []).every(row => rowSelection.selectedKeys.includes(rowKey(row)));
  const isPartiallySelected = rowSelection && (data || []).length > 0 && !isAllSelected && (data || []).some(row => rowSelection.selectedKeys.includes(rowKey(row)));

  const renderPagination = () => {
    // 防御性检查：如果没有数据或只有一页，不显示分页
    if (safeTotal <= 0 || totalPages <= 0) return null;

    // Simple pagination logic: show current, prev, next, first, last
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safePage <= 3) {
        pages.push(1, 2, 3, 4, 'ellipsis', totalPages);
      } else if (safePage >= totalPages - 2) {
        pages.push(1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, 'ellipsis', safePage - 1, safePage, safePage + 1, 'ellipsis', totalPages);
      }
    }

    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <span>共 {safeTotal} 条</span>
          <div className="flex items-center gap-1">
            <span>每页</span>
            <Select
              value={safeSize.toString()}
              onValueChange={(val) => onSizeChange?.(Number(val))}
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

        <Pagination className="mx-0">
          <PaginationContent className="gap-1">
            <PaginationItem>
              <PaginationPrevious
                onClick={(e) => { e.preventDefault(); if(safePage > 1) onPageChange?.(safePage - 1); }}
                aria-disabled={safePage <= 1}
                className={safePage <= 1 ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}
              />
            </PaginationItem>

            {pages.map((p, i) => (
              <PaginationItem key={i}>
                {p === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    isActive={safePage === p}
                    onClick={(e) => { e.preventDefault(); onPageChange?.(p as number); }}
                    className={safePage === p ? "bg-cyan-500 text-white hover:bg-cyan-600 cursor-pointer" : "hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"}
                  >
                    {p}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                onClick={(e) => { e.preventDefault(); if(safePage < totalPages) onPageChange?.(safePage + 1); }}
                aria-disabled={safePage >= totalPages}
                className={safePage >= totalPages ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {toolbar && <div className="flex items-center justify-between">{toolbar}</div>}
      
      <div className="bg-white dark:bg-slate-950/30 dark:backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
            <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800">
              {rowSelection && (
                <TableHead className="w-[50px] text-slate-500 dark:text-cyan-600/70">
                  <Checkbox 
                    className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                    checked={isAllSelected || (isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  />
                </TableHead>
              )}
              {columns.map(col => (
                <TableHead key={col.key} style={{ width: col.width }} className="text-slate-500 font-medium text-xs uppercase tracking-wider h-12 dark:text-cyan-500/60 dark:font-mono dark:tracking-widest">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading Skeleton
              Array.from({ length: Math.min(safeSize, 5) }).map((_, i) => (
                <TableRow key={i} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-transparent">
                  {rowSelection && <TableCell><Skeleton className="h-4 w-4 bg-slate-200 dark:bg-slate-800" /></TableCell>}
                  {columns.map((col, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-[80%] bg-slate-200 dark:bg-slate-800" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columns.length + (rowSelection ? 1 : 0)} className="h-24 text-center text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-950/10 dark:border-slate-800">
                  {error}
                </TableCell>
              </TableRow>
            ) : (data || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (rowSelection ? 1 : 0)} className="h-24 border-slate-100 dark:border-slate-800">
                  <EmptyState />
                </TableCell>
              </TableRow>
              ) : (
              (data || []).map((row) => {
                const key = rowKey(row);
                const isSelected = rowSelection?.selectedKeys.includes(key);
                return (
                  <TableRow 
                    key={key} 
                    data-state={isSelected ? "selected" : undefined}
                    className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-cyan-950/20 dark:hover:shadow-[inset_2px_0_0_0_rgba(34,211,238,0.5)] transition-all duration-200 group data-[state=selected]:bg-slate-100 dark:data-[state=selected]:bg-cyan-950/30"
                  >
                    {rowSelection && (
                      <TableCell>
                        <Checkbox 
                          className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectRow(key, checked === true)}
                        />
                      </TableCell>
                    )}
                    {columns.map(col => (
                      <TableCell key={col.key} className="text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors py-3 font-normal dark:font-light">
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
      {renderPagination()}
    </div>
  );
}
