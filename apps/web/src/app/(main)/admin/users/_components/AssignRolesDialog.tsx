'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Label } from '@/app/components/ui/label';
import { User } from '@/types/user';
import { RoleRead as RoleType } from '@/types';
import { getRolesList, assignUserRoles } from '@/services/adminService';
import { toast } from 'sonner';

interface AssignRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  /** 分配成功回调，返回新分配的角色列表 */
  onSuccess: (roles: Array<{ id: number; name: string; description?: string | null; is_system: boolean }>) => void;
}

export function AssignRolesDialog({ open, onOpenChange, user, onSuccess }: AssignRolesDialogProps) {
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadRoles();
      // 从 user 对象中获取已选角色
      if (user.roles && user.roles.length > 0) {
        setSelectedRoleIds(user.roles.map(role => role.id));
      } else if (user.role_ids && user.role_ids.length > 0) {
        setSelectedRoleIds(user.role_ids);
      } else {
        setSelectedRoleIds([]);
      }
    }
  }, [open, user]);

  const loadRoles = async () => {
    try {
      setIsLoading(true);
      const list = await getRolesList();
      setRoles(list.items);
    } catch (error) {
      toast.error('获取角色列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setIsSaving(true);
      await assignUserRoles(user.id, selectedRoleIds);
      toast.success('角色分配成功');
      // 构造新角色信息并返回（从已选角色ID和角色列表中匹配）
      const newRoles = roles
        .filter(role => selectedRoleIds.includes(role.id))
        .map(role => ({
          id: role.id,
          name: role.name,
          description: role.description,
          is_system: role.is_system
        }));
      onSuccess(newRoles);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || '角色分配失败');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds(prev => 
      prev.includes(roleId) 
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>分配角色 - {user?.username}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground">加载中...</div>
          ) : roles.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">暂无可用角色</div>
          ) : (
            <div className="grid gap-2">
              {roles.map(role => (
                <div key={role.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`role-${role.id}`} 
                    checked={selectedRoleIds.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <Label htmlFor={`role-${role.id}`}>{role.name}</Label>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
