'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

// 透明无边框风格 - 用于 FilterBar、工具栏
export function TransparentSelect({
  value,
  onValueChange,
  placeholder,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`w-[160px] border-none bg-transparent hover:bg-surface/10 text-text-primary focus:ring-0 transition-all rounded-lg h-9 font-medium shadow-none pl-2 ${className || ''}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-surface/95 backdrop-blur-xl border-border/20 text-text-primary shadow-xl">
        {children}
      </SelectContent>
    </Select>
  );
}

// 表单风格 - 用于 ProfilePage、UserFormDialog
export function FormSelect({
  value,
  onValueChange,
  placeholder,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all font-mono ${className || ''}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 shadow-lg rounded-lg">
        {children}
      </SelectContent>
    </Select>
  );
}

// 设置页面风格 - 用于 SystemSettingsPage
export function SettingSelect({
  value,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-foreground dark:text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all ${className || ''}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-foreground dark:text-slate-200 shadow-lg rounded-lg">
        {children}
      </SelectContent>
    </Select>
  );
}

// 数据源页面风格 - 用于 DataSourcePage
export function DataSourceSelect({
  value,
  onValueChange,
  defaultValue,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} defaultValue={defaultValue}>
      <SelectTrigger
        className={`px-3 py-2 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-all ${className || ''}`}
      >
        <SelectValue placeholder="全部" />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-lg rounded-lg">
        {children}
      </SelectContent>
    </Select>
  );
}
