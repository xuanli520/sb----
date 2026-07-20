'use client';

import React from 'react';
import { FilterBar, FilterItem } from '../../_components/common/FilterBar';

interface UserFilterProps {
  value: Record<string, any>;
  onChange: (patch: Record<string, any>, opts?: { resetPage?: boolean }) => void;
  onReset: () => void;
  roles?: { label: string; value: string }[];
}

export function UserFilter({ value, onChange, onReset, roles = [] }: UserFilterProps) {
  const items: FilterItem[] = [
    { 
      type: 'input', 
      key: 'username', 
      placeholder: '搜索用户名...', 
      label: '用户名'
    },
    { 
      type: 'input', 
      key: 'email', 
      placeholder: '搜索邮箱...', 
      label: '邮箱' 
    },
    {
      type: 'select',
      key: 'is_active',
      placeholder: '全部状态',
      label: '状态',
      options: [
        { label: '正常', value: 'true' },
        { label: '禁用', value: 'false' },
      ]
    },
    {
      type: 'select',
      key: 'is_superuser',
      placeholder: '全部角色',
      label: '管理员',
      options: [
        { label: '是', value: 'true' },
        { label: '否', value: 'false' },
      ]
    },
    // If roles are provided, show role filter
    ...(roles.length > 0 ? [{
      type: 'select',
      key: 'role_id',
      placeholder: '选择角色',
      label: '角色',
      options: roles
    } as FilterItem] : [])
  ];

  return (
    <FilterBar 
      items={items} 
      value={value} 
      onChange={onChange} 
      onReset={onReset} 
    />
  );
}
