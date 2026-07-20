'use client';

import React from 'react';
import { User } from '@/types/user';
import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Key, Shield } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { useUserStore } from '@/stores/userStore';

interface UserActionsProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onAssignRoles: (user: User) => void;
  onResetPassword: (user: User) => void;
}

export function UserActions({ user, onEdit, onDelete, onAssignRoles, onResetPassword }: UserActionsProps) {
  const { currentUser } = useUserStore();
  const isSelf = currentUser?.id === user.id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">打开菜单</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>操作</DropdownMenuLabel>
        
        <PermissionGate permission="user:update" mode="hide">
            <DropdownMenuItem onClick={() => onEdit(user)}>
            <Edit className="mr-2 h-4 w-4" />
            编辑用户
            </DropdownMenuItem>
        </PermissionGate>

        <PermissionGate permission="user:manage_roles" mode="hide">
            <DropdownMenuItem onClick={() => onAssignRoles(user)}>
            <Shield className="mr-2 h-4 w-4" />
            分配角色
            </DropdownMenuItem>
        </PermissionGate>

        <PermissionGate permission="user:update" mode="hide">
             <DropdownMenuItem onClick={() => onResetPassword(user)}>
            <Key className="mr-2 h-4 w-4" />
            重置密码
            </DropdownMenuItem>
        </PermissionGate>
        
        <DropdownMenuSeparator />
        
        <PermissionGate permission="user:delete" mode="hide">
            <DropdownMenuItem 
                onClick={() => onDelete(user)} 
                disabled={isSelf}
                className={isSelf ? "opacity-50 cursor-not-allowed" : "text-red-600 focus:text-red-600"}
            >
                <Trash2 className="mr-2 h-4 w-4" />
                删除用户
            </DropdownMenuItem>
        </PermissionGate>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
