'use client';

import { useState, useEffect } from 'react';
import { X, Shield, User as UserIcon, Mail, Phone, Lock, Briefcase, Info } from 'lucide-react';
import type { User, UserCreate, UserUpdate } from '@/types/user';
import { FormSelect } from '@/app/components/ui/styled-select';
import { SelectItem } from '@/app/components/ui/select';

interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserCreate | UserUpdate) => Promise<void>;
  user?: User | null;
  mode: 'create' | 'edit' | 'permissions';
}

export function UserFormDialog({
  isOpen,
  onClose,
  onSubmit,
  user,
  mode,
}: UserFormDialogProps) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    password: '',
    phone: user?.phone || '',
    gender: user?.gender || '',
    department: user?.department || '',
    is_active: user?.is_active ?? true,
    is_superuser: user?.is_superuser ?? false,
    is_verified: user?.is_verified ?? false,
  });

  // 监听 user 和 mode 变化，同步更新表单数据
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
        password: '',
        phone: user.phone || '',
        gender: user.gender || '',
        department: user.department || '',
        is_active: user.is_active ?? true,
        is_superuser: user.is_superuser ?? false,
        is_verified: user.is_verified ?? false,
      });
    } else if (mode === 'create') {
      // 新建模式时重置表单
      setFormData({
        username: '',
        email: '',
        password: '',
        phone: '',
        gender: '',
        department: '',
        is_active: true,
        is_superuser: false,
        is_verified: false,
      });
    }
  }, [user, mode]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'create' && formData.password.length < 8) {
      setError('密码长度不能少于8位');
      return;
    }

    setIsLoading(true);

    try {
      const buildSubmitData = () => {
        const data: Record<string, unknown> = {
          username: formData.username,
          email: formData.email,
          is_active: formData.is_active,
          is_superuser: formData.is_superuser,
          is_verified: formData.is_verified,
        };

        if (formData.phone) data.phone = formData.phone;
        if (formData.gender) data.gender = formData.gender;
        if (formData.department) data.department = formData.department;

        if (mode === 'create') {
          data.password = formData.password;
        }

        return data;
      };

      const submitData = buildSubmitData();
      await onSubmit(submitData);
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const title = mode === 'create' ? '用户 // 注册' : mode === 'edit' ? '用户 // 编辑' : '用户 // 权限';

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/30 rounded-xl shadow-2xl dark:shadow-[0_0_50px_rgba(8,145,178,0.2)] overflow-hidden relative group transition-colors">
        
        {/* Decorative corner accents (Dark Mode Only) */}
        <div className="hidden dark:block absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-400 opacity-50"></div>
        <div className="hidden dark:block absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-400 opacity-50"></div>
        <div className="hidden dark:block absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400 opacity-50"></div>
        <div className="hidden dark:block absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-400 opacity-50"></div>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-cyan-500/30 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-cyan-400 tracking-widest font-mono">
              {title}
            </h2>
            {user && mode !== 'create' && (
              <p className="text-xs text-slate-500 dark:text-cyan-500/70 font-mono mt-1 flex items-center gap-1">
                ID: {user.id} <span className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse inline-block ml-1"></span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-cyan-500/10 rounded-lg text-slate-500 hover:text-slate-800 dark:text-cyan-500/50 dark:hover:text-cyan-300 transition-all border border-transparent dark:hover:border-cyan-500/30"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto sidebar-scrollbar">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-mono flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Username */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                用户名 <span className="text-cyan-600 dark:text-cyan-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-600 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-500 transition-colors" />
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={mode === 'permissions'}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:focus:border-cyan-500/50 dark:focus:ring-0 dark:focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 transition-all font-mono"
                  placeholder="请输入用户名"
                />
              </div>
            </div>

            {/* Email */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                邮箱 <span className="text-cyan-600 dark:text-cyan-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-600 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-500 transition-colors" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={mode === 'permissions'}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:focus:border-cyan-500/50 dark:focus:ring-0 dark:focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 transition-all font-mono"
                  placeholder="请输入邮箱"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                手机号
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-600 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-500 transition-colors" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={mode === 'permissions'}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:focus:border-cyan-500/50 dark:focus:ring-0 dark:focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 transition-all font-mono"
                  placeholder="请输入手机号"
                />
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                性别
              </label>
              <FormSelect
                value={formData.gender || 'unset'}
                onValueChange={(val) => setFormData({ ...formData, gender: val === 'unset' ? '' : val })}
                placeholder="请选择..."
              >
                <SelectItem value="unset">请选择...</SelectItem>
                <SelectItem value="male">男</SelectItem>
                <SelectItem value="female">女</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </FormSelect>
            </div>

            {/* Department */}
            <div className="col-span-2">
              <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                部门
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-600 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-500 transition-colors" />
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  disabled={mode === 'permissions'}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:focus:border-cyan-500/50 dark:focus:ring-0 dark:focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 transition-all font-mono"
                  placeholder="请输入所属部门"
                />
              </div>
            </div>

            {/* Password */}
            {mode === 'create' && (
              <div className="col-span-2">
                <label className="block text-xs font-mono text-slate-500 dark:text-cyan-200/50 mb-1.5 tracking-wider uppercase">
                  密码 <span className="text-cyan-600 dark:text-cyan-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-600 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-500 transition-colors" />
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:focus:border-cyan-500/50 dark:focus:ring-0 dark:focus:shadow-[0_0_15px_rgba(34,211,238,0.1)] text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 transition-all font-mono"
                    placeholder="请输入密码 (至少8位)"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Permissions Section */}
          {mode !== 'create' && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-cyan-600 dark:text-cyan-500" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-cyan-400 font-mono tracking-wider">访问协议 / 权限</h3>
              </div>

              <div className="grid grid-cols-1 gap-3 p-3 bg-slate-50 dark:bg-slate-950/30 rounded-lg border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.is_active ? 'bg-cyan-600 border-cyan-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent'}`}>
                    {formData.is_active && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="hidden"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-mono group-hover:text-cyan-700 dark:group-hover:text-cyan-200 transition-colors">账户激活</span>
                </label>

                <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.is_superuser ? 'bg-purple-600 border-purple-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent'}`}>
                    {formData.is_superuser && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_superuser}
                    onChange={(e) => setFormData({ ...formData, is_superuser: e.target.checked })}
                    className="hidden"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-mono group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">超级管理员权限</span>
                </label>

                <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.is_verified ? 'bg-emerald-600 border-emerald-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent'}`}>
                    {formData.is_verified && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_verified}
                    onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                    className="hidden"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-mono group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">邮箱已验证</span>
                </label>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-200 dark:border-cyan-500/30 flex items-center justify-end gap-4 bg-slate-50 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-cyan-400 transition-colors uppercase tracking-wider"
          >
            [ 取消 ]
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 dark:text-cyan-400 dark:border dark:border-cyan-500/50 dark:hover:border-cyan-400 dark:rounded dark:hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] font-mono tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
          >
            {isLoading ? <span className="animate-pulse">处理中...</span> : (
               <>
                 <span className="w-2 h-2 bg-white dark:bg-cyan-400 rounded-full group-hover:animate-ping"></span>
                 {mode === 'create' ? '创建用户' : '保存修改'}
               </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
