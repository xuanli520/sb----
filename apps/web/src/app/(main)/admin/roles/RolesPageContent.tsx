'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  getRolesList,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getPermissions,
  assignRolePermissions,
  RoleListParams
} from '@/services/adminService';
import { RoleRead, RoleWithPermissions, PermissionRead } from '@/types';
import { CyberButton } from '@/components/ui/cyber/CyberButton';

// 模块名称映射
const MODULE_NAME_MAP: Record<string, string> = {
  user: '用户',
  role: '角色',
  permission: '权限',
  data: '数据',
  report: '报告',
  settings: '设置',
  system: '系统',
};
import { CyberInput } from '@/components/ui/cyber/CyberInput';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/cyber/CyberDialog';
import { Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { RoleTable } from './RoleTable';
import { DeleteConfirmDialog } from '../_components/common/DeleteConfirmDialog';
import { useQueryState, QueryCodec } from '../_components/common/QueryState';
import { DataTable, DataTableColumn } from '../_components/common/DataTable';
import { CyberBadge } from '@/components/ui/cyber/CyberBadge';

interface RoleFormValues {
  name: string;
  description: string;
}

const roleQueryCodec: QueryCodec<RoleListParams> = {
  parse: (sp) => ({
    page: Number(sp.get('page')) || 1,
    size: Number(sp.get('size')) || 10,
    name: sp.get('name') || undefined,
  }),
  serialize: (state) => ({
    page: state.page?.toString(),
    size: state.size?.toString(),
    name: state.name,
  }),
  resetPageOnChangeKeys: ['name', 'size']
};

export function RolesPageContent() {
  const [query, setQuery] = useQueryState(roleQueryCodec);
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionRead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Dialog States
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRead | null>(null);

  // Form handling
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting: isFormSubmitting }
  } = useForm<RoleFormValues>();

  // Permission Assignment Dialog - 使用本地 state（对话框关闭后不需要保留状态）
  const [isPermDialogOpen, setIsPermDialogOpen] = useState(false);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<RoleWithPermissions | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<(string | number)[]>([]);
  const [isPermSubmitting, setIsPermSubmitting] = useState(false);
  const [permPage, setPermPage] = useState(1);
  const [permPageSize, setPermPageSize] = useState(20);
  const [permSearch, setPermSearch] = useState('');

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleRead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [rolesData, permsData] = await Promise.all([
        getRolesList(query),
        getPermissions({ page: 1, size: 100 })
      ]);

      const rolesWithPermissions = await Promise.all(
        rolesData.items.map(async (role: RoleRead) => {
          try {
            return await getRole(role.id);
          } catch {
            return { ...role, permissions: [] };
          }
        })
      );

      setRoles(rolesWithPermissions);
      setTotal(rolesData.meta?.total || 0);
      setAllPermissions(permsData.items);
    } catch (error) {
      toast.error('加载角色数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Role CRUD ---

  const handleCreateClick = () => {
    setEditingRole(null);
    reset({ name: '', description: '' });
    setIsRoleDialogOpen(true);
  };

  const handleEditClick = (role: RoleRead) => {
    setEditingRole(role);
    setValue('name', role.name);
    setValue('description', role.description || '');
    setIsRoleDialogOpen(true);
  };

  const onRoleSubmit = async (data: RoleFormValues) => {
    try {
      if (editingRole) {
        await updateRole(editingRole.id, { name: data.name, description: data.description });
        toast.success('角色已更新');
      } else {
        await createRole({ name: data.name, description: data.description });
        toast.success('角色已创建');
      }
      setIsRoleDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleDeleteClick = (role: RoleRead) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;
    setIsDeleting(true);
    try {
      await deleteRole(roleToDelete.id);
      toast.success('角色已删除');
      setRoles(roles.filter(r => r.id !== roleToDelete.id));
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error('删除角色失败');
    } finally {
      setIsDeleting(false);
      setRoleToDelete(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    setQuery({ page: newPage });
  };

  const handleSizeChange = (newSize: number) => {
    setQuery({ size: newSize, page: 1 });
  };

  // --- Permission Assignment (Dialog) ---

  const handlePermsClick = (role: RoleWithPermissions) => {
    setSelectedRoleForPerms(role);
    const currentIds = role.permissions?.map(p => p.id) || [];
    setSelectedPermIds(currentIds);
    setPermPage(1);
    setPermSearch('');
    setIsPermDialogOpen(true);
  };

  const handlePermsSubmit = async () => {
    if (!selectedRoleForPerms) return;
    setIsPermSubmitting(true);
    try {
      const permIds = selectedPermIds.map(id => Number(id));
      await assignRolePermissions(selectedRoleForPerms.id, permIds);
      toast.success('权限已更新');
      setIsPermDialogOpen(false);

      const updatedRole = await getRole(selectedRoleForPerms.id);
      setRoles(prev => prev.map(r => r.id === updatedRole.id ? updatedRole : r));

    } catch (error) {
      toast.error('更新权限失败');
    } finally {
      setIsPermSubmitting(false);
    }
  };

  const permColumns: DataTableColumn<PermissionRead>[] = [
    {
      key: 'module',
      header: '模块',
      render: (perm) => (
        <CyberBadge variant="outline" className="uppercase tracking-wider text-[10px]">
          {MODULE_NAME_MAP[perm.module] || perm.module || '系统'}
        </CyberBadge>
      ),
    },
    {
      key: 'code',
      header: '权限代码',
      render: (perm) => (
        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-sm">{perm.code}</span>
      ),
    },
    {
      key: 'name',
      header: '权限名称',
      render: (perm) => (
        <span className="font-medium text-slate-900 dark:text-white">{perm.name}</span>
      ),
    },
    {
      key: 'description',
      header: '描述',
      render: (perm) => (
        <span className="text-slate-500 dark:text-slate-400 text-sm">{perm.description || '-'}</span>
      ),
    },
  ];

  const filteredPermissions = useMemo(() => {
    if (!permSearch) return allPermissions;
    const searchLower = permSearch.toLowerCase();
    return allPermissions.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.code.toLowerCase().includes(searchLower) ||
      p.module?.toLowerCase().includes(searchLower)
    );
  }, [allPermissions, permSearch]);

  const paginatedPermissions = useMemo(() => {
    const start = (permPage - 1) * permPageSize;
    return filteredPermissions.slice(start, start + permPageSize);
  }, [filteredPermissions, permPage, permPageSize]);

  const permPagination = useMemo(() => ({
    page: permPage,
    size: permPageSize,
    total: filteredPermissions.length
  }), [permPage, permPageSize, filteredPermissions.length]);

  const permRowSelection = useMemo(() => ({
    selectedKeys: selectedPermIds,
    onChange: (keys: (string | number)[]) => setSelectedPermIds(keys)
  }), [selectedPermIds]);

  const handlePermPageChange = (newPage: number) => {
    setPermPage(newPage);
  };

  const handlePermSizeChange = (newSize: number) => {
    setPermPageSize(newSize);
    setPermPage(1);
  };

  const handlePermSearchChange = (value: string) => {
    setPermSearch(value);
    setPermPage(1);
  };

  return (
    <div className="p-6 space-y-6 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground dark:text-slate-400 mt-1 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            定义角色并分配访问级别
          </p>
        </div>
        <CyberButton onClick={handleCreateClick} className="shadow-lg shadow-cyan-500/20 group">
          <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          新建角色
        </CyberButton>
      </div>

      <RoleTable
        data={roles}
        loading={loading}
        pagination={{ page: query.page || 1, size: query.size || 10, total }}
        onPageChange={handlePageChange}
        onSizeChange={handleSizeChange}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onAssignPermissions={handlePermsClick}
      />

      {/* Create/Edit Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>
              配置角色详细信息。系统角色无法重命名。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onRoleSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">角色名称</label>
              <CyberInput
                {...register('name', { required: '角色名称为必填项' })}
                placeholder="例如：内容编辑"
                disabled={editingRole?.is_system}
              />
              {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <CyberInput
                {...register('description')}
                placeholder="职责简述..."
              />
            </div>
            <DialogFooter>
              <CyberButton type="button" variant="ghost" onClick={() => setIsRoleDialogOpen(false)}>取消</CyberButton>
              <CyberButton type="submit" isLoading={isFormSubmitting}>
                {editingRole ? '保存更改' : '创建角色'}
              </CyberButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="确认删除角色？"
        description={roleToDelete ? `确定要删除角色 "${roleToDelete.name}" 吗？此操作无法撤销。` : '确定要删除此角色吗？此操作无法撤销。'}
      />

      {/* Permissions Assignment Dialog */}
      <Dialog open={isPermDialogOpen} onOpenChange={setIsPermDialogOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>分配权限： <span className="text-cyan-500">{selectedRoleForPerms?.name}</span></DialogTitle>
            <DialogDescription>
              选择此角色应拥有的功能权限，已选择 {selectedPermIds.length} 项权限
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <CyberInput
              placeholder="搜索权限名称、代码或模块..."
              value={permSearch}
              onChange={(e) => handlePermSearchChange(e.target.value)}
              className="w-full"
            />

            <div className="flex-1 min-h-0 overflow-auto">
              <DataTable
                data={paginatedPermissions}
                columns={permColumns}
                pagination={permPagination}
                onPageChange={handlePermPageChange}
                onSizeChange={handlePermSizeChange}
                rowKey={(perm) => perm.id}
                rowSelection={permRowSelection}
                className="h-full"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10 shrink-0">
            <CyberButton type="button" variant="ghost" onClick={() => setIsPermDialogOpen(false)}>取消</CyberButton>
            <CyberButton type="button" onClick={handlePermsSubmit} isLoading={isPermSubmitting}>
              保存权限
            </CyberButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
