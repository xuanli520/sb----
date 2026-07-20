'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Save, Camera, User, Mail, Phone, Building, Shield, Award, Loader2, UserCheck } from 'lucide-react';
import maleAvatar from '@/assets/male.jpg';
import femaleAvatar from '@/assets/female.jpg';
import { GlassCard } from '@/app/components/ui/glass-card';
import { NeonTitle } from '@/app/components/ui/neon-title';
import { useUserStore } from '@/stores/userStore';
import { FormSelect } from '@/app/components/ui/styled-select';
import { SelectItem } from '@/app/components/ui/select';
import * as userService from '@/services/userService';

import { toast } from 'sonner';

export default function ProfilePage() {
  const { currentUser, fetchCurrentUser, isSuperuser } = useUserStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    gender: '',
    department: '',
    position: '',
    role: '',
    level: 'L7 Senior',
  });

  // 初始化表单数据
  useEffect(() => {
    if (currentUser) {
      setFormData({
        username: currentUser.username || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        gender: currentUser.gender || '',
        department: currentUser.department || '',
        position: '',
        role: currentUser.is_superuser ? '系统管理员' : '普通用户',
        level: 'L7 Senior',
      });
    } else {
      fetchCurrentUser();
    }
  }, [currentUser, fetchCurrentUser]);

  // 从后端获取最新数据后更新表单
  useEffect(() => {
    if (currentUser) {
      setFormData((prev) => ({
        ...prev,
        username: currentUser.username || prev.username,
        email: currentUser.email || prev.email,
        phone: currentUser.phone || prev.phone || '',
        gender: currentUser.gender || prev.gender || '',
        department: currentUser.department || prev.department || '',
      }));
    }
  }, [currentUser]);

  const handleSave = async () => {
    setIsLoading(true);

    try {
      const updateData: { username: string; email: string; phone?: string; gender?: string; department?: string } = {
        username: formData.username,
        email: formData.email,
      };
      if (formData.phone) updateData.phone = formData.phone;
      if (formData.gender) updateData.gender = formData.gender;
      if (formData.department) updateData.department = formData.department;

      await userService.updateCurrentUser(updateData);

      await fetchCurrentUser();
      toast.success('保存成功');
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message || '保存失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleLabel = (): string => {
    if (isSuperuser) return '系统管理员';
    return '普通用户';
  };

  if (!currentUser && !formData.username) {
    return (
      <div className="min-h-screen bg-transparent text-foreground p-6 relative flex items-center justify-center">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-foreground p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="fixed top-1/4 left-1/4 w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none" />

      <GlassCard className="max-w-4xl mx-auto p-8 relative z-10">

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-white/10 pb-6 mb-8 flex justify-between items-end">
            <div>
                 <NeonTitle icon={User}>个人信息中心</NeonTitle>
                 <p className="text-sm text-slate-500 font-mono mt-1">管理您的个人账户信息</p>
            </div>
             <div className="px-3 py-1 rounded-full bg-cyan-500/10 dark:bg-cyan-950/30 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 text-xs font-mono shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                状态: {currentUser?.is_active ? '已激活' : '未激活'}
             </div>
        </div>

        <div className="flex flex-col md:flex-row gap-12">
          {/* Left Column: Avatar & Status */}
          <div className="flex flex-col items-center gap-6 md:w-1/3">
            <div className="relative group">
              <div className={`w-32 h-32 rounded-full overflow-hidden border-4 border-slate-200 dark:border-slate-800 transition-all duration-500 ${
                formData.gender === 'female'
                  ? 'shadow-[0_0_20px_rgba(244,114,182,0.6)] group-hover:shadow-[0_0_30px_rgba(244,114,182,0.8)]'
                  : 'shadow-[0_0_20px_rgba(34,211,238,0.3)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]'
              }`}>
                <Image
                  src={formData.gender === 'female' ? femaleAvatar : maleAvatar}
                  alt="用户头像"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              </div>
              <button className={`absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors border-2 border-white dark:border-[#050714] shadow-lg group-hover:scale-110 ${
                formData.gender === 'female'
                  ? 'bg-pink-500 hover:bg-pink-400'
                  : 'bg-cyan-600 hover:bg-cyan-500'
              }`}>
                <Camera size={18} />
              </button>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formData.username || '未知用户'}
              </h2>
              <p className="text-sm text-cyan-600 dark:text-cyan-400 font-mono mt-1">{formData.position}</p>
            </div>

            <div className="w-full space-y-3">
                <div className="p-4 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <Shield size={18} />
                    </div>
                    <div>
                         <div className="text-xs text-slate-500 font-mono uppercase">角色</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">{getRoleLabel()}</div>
                    </div>
                </div>
                 <div className="p-4 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400">
                        <Award size={18} />
                    </div>
                    <div>
                         <div className="text-xs text-slate-500 font-mono uppercase">等级</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">{formData.level}</div>
                    </div>
                </div>
            </div>
          </div>

          {/* Right Column: Form */}
          <div className="flex-1">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 用户名 */}
              <div className="space-y-2">
                 <label className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                     <User size={14} /> 用户名
                 </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 text-slate-900 dark:text-slate-200 transition-all"
                  />
                ) : (
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-300 font-mono">
                    {formData.username || '未知'}
                  </div>
                )}
              </div>

              {/* 邮箱 */}
              <div className="space-y-2">
                 <label className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                     <Mail size={14} /> 邮箱
                 </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 text-slate-900 dark:text-slate-200 transition-all"
                  />
                ) : (
                   <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-300 font-mono">
                    {formData.email || '未知'}
                  </div>
                )}
              </div>

              {/* 手机号 */}
              <div className="space-y-2">
                 <label className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                     <Phone size={14} /> 手机号
                 </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 text-slate-900 dark:text-slate-200 transition-all"
                    placeholder="暂未设置"
                  />
                ) : (
                   <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-300 font-mono">
                    {formData.phone || '暂未设置'}
                  </div>
                )}
              </div>

              {/* 部门 */}
              <div className="space-y-2">
                 <label className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                     <Building size={14} /> 部门
                 </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 text-slate-900 dark:text-slate-200 transition-all"
                    placeholder="暂未设置"
                  />
                ) : (
                   <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-300 font-mono">
                    {formData.department || '暂未设置'}
                  </div>
                )}
              </div>

              {/* 性别 */}
              <div className="space-y-2">
                 <label className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                     <UserCheck size={14} /> 性别
                 </label>
                {isEditing ? (
                  <FormSelect
                    value={formData.gender || 'unset'}
                    onValueChange={(val) => setFormData({ ...formData, gender: val === 'unset' ? '' : val })}
                    placeholder="请选择..."
                  >
                    <SelectItem value="unset">未设置</SelectItem>
                    <SelectItem value="male">男</SelectItem>
                    <SelectItem value="female">女</SelectItem>
                  </FormSelect>
                ) : (
                   <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-300 font-mono">
                    {formData.gender === 'male' ? '男' : formData.gender === 'female' ? '女' : '未设置'}
                  </div>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="mt-10 pt-6 border-t border-slate-200 dark:border-white/10 flex items-center gap-4">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 text-white rounded-lg transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] font-medium disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        保存更改
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isLoading}
                    className="px-6 py-2.5 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2.5 bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-cyan-600 dark:text-cyan-400 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.1] hover:border-cyan-500/50 transition-all shadow-sm dark:shadow-[0_0_10px_rgba(0,0,0,0.5)] font-medium"
                >
                  编辑资料
                </button>
              )}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
