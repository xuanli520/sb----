'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { 
  UserStats, 
  UserTable, 
  AssignRolesDialog, 
  ResetPasswordDialog 
} from './_components';
import { useQueryState, QueryCodec } from '../_components/common/QueryState';
import { 
  getUsers, 
  getUserStats, 
  deleteUser, 
  UserListParams, 
  createUser,
  updateUser
} from '@/services/adminService';
import { User, UserCreate, UserUpdate } from '@/types/user';
import { UserStatsResponse } from '@/types';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DeleteConfirmDialog } from '../_components/common/DeleteConfirmDialog';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { UserFormDialog } from '@/app/components/UserFormDialog';
import { UserFilter } from './_components/UserFilter';

const userQueryCodec: QueryCodec<UserListParams> = {
  parse: (sp) => ({
    page: Number(sp.get('page')) || 1,
    size: Number(sp.get('size')) || 20,
    username: sp.get('username') || undefined,
    email: sp.get('email') || undefined,
    is_active: sp.get('is_active') === 'true' ? true : sp.get('is_active') === 'false' ? false : undefined,
    is_superuser: sp.get('is_superuser') === 'true' ? true : sp.get('is_superuser') === 'false' ? false : undefined,
    role_id: sp.get('role_id') ? Number(sp.get('role_id')) : undefined,
  }),
  serialize: (state) => ({
    page: state.page?.toString(),
    size: state.size?.toString(),
    username: state.username,
    email: state.email,
    is_active: state.is_active === undefined ? undefined : String(state.is_active),
    is_superuser: state.is_superuser === undefined ? undefined : String(state.is_superuser),
    role_id: state.role_id?.toString(),
  }),
  resetPageOnChangeKeys: ['username', 'email', 'is_active', 'is_superuser', 'role_id', 'size']
};

function UsersPageContent() {
  const [query, setQuery] = useQueryState(userQueryCodec);
  
  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<UserStatsResponse>({ total: 0, active: 0, inactive: 0, superusers: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);

  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [assignRolesOpen, setAssignRolesOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await getUsers(query);
      setData(res.items || []);
      setTotal(res.meta?.total || 0);
    } catch {
      toast.error('获取用户列表失败');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const fetchStats = useCallback(async () => {
    try {
      setIsStatsLoading(true);
      const res = await getUserStats();
      setStats(res);
    } catch (error) {
      console.error("Failed to fetch stats", error);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCreate = () => {
    setEditingUser(null);
    setUserFormMode('create');
    setUserFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setUserFormMode('edit');
    setUserFormOpen(true);
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      setIsDeleting(true);
      await deleteUser(userToDelete.id);
      toast.success('删除成功');
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '删除失败';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAssignRoles = (user: User) => {
    setTargetUser(user);
    setAssignRolesOpen(true);
  };

  const handleAssignRolesSuccess = (newRoles: Array<{ id: number; name: string; description?: string | null; is_system: boolean }>) => {
    if (!targetUser) return;
    setData(prevData =>
      prevData.map(u =>
        u.id === targetUser.id
          ? { ...u, roles: newRoles }
          : u
      )
    );
  };

  const handleResetPassword = (user: User) => {
    setTargetUser(user);
    setResetPasswordOpen(true);
  };

  const handleUserFormSubmit = async (data: UserCreate | UserUpdate) => {
    if (userFormMode === 'create') {
      await createUser(data as UserCreate);
      toast.success('创建用户成功');
    } else {
      if (!editingUser) return;
      await updateUser(editingUser.id, data as UserUpdate);
      toast.success('更新用户成功');
    }
    fetchData();
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        </h1>
        <PermissionGate permission="user:create" mode="hide">
          <CyberButton onClick={handleCreate} className="shadow-lg shadow-cyan-500/20 group">
            <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
            新建用户
          </CyberButton>
        </PermissionGate>
      </div>

      <UserFilter 
        value={query} 
        onChange={setQuery} 
        onReset={() => setQuery({ 
             page: 1, 
             size: 20, 
             username: undefined, 
             email: undefined, 
             is_active: undefined, 
             is_superuser: undefined, 
             role_id: undefined 
        }, { resetPage: true })}
      />

      <UserStats stats={stats} isLoading={isStatsLoading} />

      <UserTable
        data={data}
        isLoading={isLoading}
        pagination={{ page: query.page || 1, size: query.size || 20, total }}
        onPageChange={(page) => setQuery({ page })}
        onSizeChange={(size) => setQuery({ size, page: 1 })}
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAssignRoles={handleAssignRoles}
        onResetPassword={handleResetPassword}
      />

      <UserFormDialog
        isOpen={userFormOpen}
        onClose={() => setUserFormOpen(false)}
        onSubmit={handleUserFormSubmit}
        user={editingUser}
        mode={userFormMode}
      />

      <AssignRolesDialog
        open={assignRolesOpen}
        onOpenChange={setAssignRolesOpen}
        user={targetUser}
        onSuccess={handleAssignRolesSuccess}
      />

      <ResetPasswordDialog
        open={resetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
        user={targetUser}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        description={
          userToDelete 
          ? `确定要删除用户 "${userToDelete.username}" 吗？此操作无法撤销。` 
          : undefined
        }
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="p-6">加载中...</div>}>
      <UsersPageContent />
    </Suspense>
  );
}
