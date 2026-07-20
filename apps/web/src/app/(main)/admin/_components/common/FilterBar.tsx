'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { X, Search } from 'lucide-react';

export type FilterItem =
  | { type: 'input'; key: string; placeholder?: string; debounceMs?: number; label?: string }
  | { type: 'select'; key: string; placeholder?: string; options: { label: string; value: string }[]; label?: string }
  | { type: 'switch'; key: string; label: string };

interface FilterBarProps {
  items: FilterItem[];
  value: Record<string, any>;
  onChange: (patch: Record<string, any>, opts?: { resetPage?: boolean }) => void;
  onReset: () => void;
  className?: string;
}

function DebouncedInput({ 
  value, 
  onChange, 
  placeholder, 
  debounceMs = 500,
  className 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string; 
  debounceMs?: number;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, onChange, value, debounceMs]);

  return (
    <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full pl-9 ${className ?? ''}`}
        />
    </div>
  );
}

export function FilterBar({ items, value, onChange, onReset, className }: FilterBarProps) {
  const hasActiveFilters = items.some(item => {
    const val = value[item.key];
    if (item.type === 'switch') return val === true || val === 'true';
    return val !== undefined && val !== '' && val !== null;
  });

  return (
    <div className={`filter-bar-container w-full flex flex-wrap items-end gap-3 md:gap-4 ${className ?? ''}`}>
      {items.map((item) => {
        if (item.type === 'input') {
          return (
            <div key={item.key} className="flex min-w-[220px] flex-1 flex-col gap-1.5 md:flex-none md:w-[220px]">
               {item.label && <Label className="text-xs font-medium">{item.label}</Label>}
              <DebouncedInput
                value={value[item.key] || ''}
                onChange={(val) => onChange({ [item.key]: val }, { resetPage: true })}
                placeholder={item.placeholder || '搜索...'}
                debounceMs={item.debounceMs}
                className="filter-input border-0 shadow-none focus-visible:ring-0"
              />
            </div>
          );
        }
        
        if (item.type === 'select') {
          return (
            <div key={item.key} className="flex min-w-[180px] flex-1 flex-col gap-1.5 md:flex-none md:w-[180px]">
               {item.label && <Label className="text-xs font-medium">{item.label}</Label>}
              <Select
                value={value[item.key]?.toString() || ''}
                onValueChange={(val) => onChange({ [item.key]: val === 'ALL' ? undefined : val }, { resetPage: true })}
              >
                <SelectTrigger className="filter-input h-9 w-full border-0 px-3 shadow-none focus:ring-0">
                  <SelectValue placeholder={item.placeholder || '请选择'} />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="ALL">全部</SelectItem>
                  {item.options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (item.type === 'switch') {
             const isChecked = value[item.key] === true || value[item.key] === 'true';
             return (
                <div key={item.key} className="flex h-[58px] min-w-[160px] flex-col justify-end gap-1.5 pb-2">
                    <div className="flex items-center gap-2">
                        <Switch
                            id={`filter-${item.key}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => onChange({ [item.key]: checked }, { resetPage: true })}
                        />
                         <Label htmlFor={`filter-${item.key}`}>{item.label}</Label>
                    </div>
                </div>
            )
        }
        
        return null;
      })}

      {hasActiveFilters && (
        <div className="flex h-[58px] flex-col justify-end gap-1.5 pb-1">
            <Button variant="ghost" size="sm" onClick={onReset} className="h-9 px-3 text-slate-100 hover:bg-white/10 hover:text-white">
            <X className="mr-2 h-4 w-4" />
            重置筛选
            </Button>
        </div>
      )}
    </div>
  );
}
