/**
 * Header组件 - 支持企业主题和赛博朋克彩蛋主题
 * Logo点击5次触发彩蛋主题切换
 */

'use client';

import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';
import Image from 'next/image';
import { ROUTES } from '@/config/routes';
import { useThemeStore } from '@/stores/themeStore';
import { useEasterEgg } from '@/hooks/useEasterEgg';
import logoImage from '@/assets/logo.png';

const menuItems = [
  { id: 'compass', label: '罗盘', href: ROUTES.COMPASS },
  { id: 'dashboard', label: '店铺详情', href: ROUTES.DASHBOARD },
  { id: 'metric-detail', label: '体验详情', href: ROUTES.METRIC_DETAIL },
  { id: 'task-schedule', label: '任务调度', href: ROUTES.TASK_SCHEDULE },
  { id: 'agent-workbench', label: 'Agent 工作台', href: ROUTES.AGENT_WORKBENCH },
  { id: 'data-source', label: '数据源管理', href: ROUTES.DATA_SOURCE },
  { id: 'scraping-rule', label: '采集规则', href: ROUTES.SCRAPING_RULE },
  { id: 'admin-users', label: '用户管理', href: ROUTES.ADMIN_USERS },
  { id: 'login-audit', label: '登录审计', href: ROUTES.ADMIN_LOGIN_AUDIT },
  { id: 'role-management', label: '角色管理', href: ROUTES.ADMIN_ROLES },
  { id: 'permission-management', label: '权限管理', href: ROUTES.ADMIN_PERMISSIONS },
  { id: 'profile', label: '个人信息', href: ROUTES.PROFILE },
  { id: 'system-settings', label: '系统设置', href: ROUTES.SYSTEM_SETTINGS },
];

export function Header() {
  const pathname = usePathname();
  const currentItem = menuItems.find(item => pathname.startsWith(item.href));
  const { appTheme, isHydrated } = useThemeStore();
  const { handleLogoClick, isTriggered } = useEasterEgg();

  // 等待主题加载完成，避免水合不匹配
  if (!isHydrated) {
    return (
      <header className="h-[80px] px-8 flex items-center justify-between z-40 bg-transparent">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <Image
               src={logoImage}
               alt="智服云声"
               width={48}
               height={48}
               className="rounded-md"
             />
             <div className="flex flex-col items-start">
               <span className="text-lg font-bold text-[#1e3a5a]">智服云声数据看板</span>
             </div>
           </div>
           <div className="h-8 w-px bg-slate-200 mx-2" />
           <h1 className="text-lg font-bold text-[#1e3a5a]">
             {currentItem?.label || '数据看板'}
           </h1>
        </div>
      </header>
    );
  }

  // 企业主题样式
  if (appTheme === 'enterprise') {
    return (
      <header className="header-enterprise h-[80px] px-8 flex items-center justify-between z-40 bg-transparent">
        {/* Logo and Page Title */}
        <div className="flex items-center gap-4">
          {/* Logo - 点击触发彩蛋 */}
          <button 
            onClick={handleLogoClick}
            className={`relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 hover:bg-slate-100 dark:hover:bg-white/10 ${
              isTriggered ? 'scale-95' : ''
            }`}
            title="点击Logo 5次切换主题"
          >
            <Image
               src={logoImage}
               alt="智服云声"
               width={48}
               height={48}
               className="rounded-md"
             />
            <div className="flex flex-col items-start">
              <span className="enterprise-brand-title text-lg font-bold text-[#1e3a5a] dark:text-slate-100">智服云声数据看板</span>
            </div>
          </button>
          
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700/80 mx-2" />
          
          <h1 className="page-title text-lg font-bold text-[#1e3a5a] dark:text-slate-100">
            {currentItem?.label || '数据看板'}
          </h1>
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-4">
          {/* Data Center Entry Button (Replaces Notification) */}
          <button 
            onClick={() => window.location.href = ROUTES.DATA_CENTER}
            className="flex items-center gap-2 rounded-md border border-[#0284c7] bg-[#0284c7] px-4 py-2 text-white shadow-sm transition-all duration-200 hover:border-[#0369a1] hover:bg-[#0369a1] dark:border-[#0ea5e9] dark:bg-[#0ea5e9] dark:text-[#082f49] dark:hover:border-[#38bdf8] dark:hover:bg-[#38bdf8]"
            title="进入数据中控台"
          >
            <LayoutDashboard size={18} />
            <span className="text-sm font-medium">数据中控台</span>
          </button>
        </div>
      </header>
    );
  }

  // 赛博朋克主题样式
  return (
    <header className="header-cyberpunk h-[80px] px-8 flex items-center justify-between z-40 bg-transparent">
      {/* Page Title - Cyberpunk HUD Style */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <h1 className="page-title text-2xl font-bold tracking-wider font-mono uppercase">
            {currentItem?.label || '数据看板'}
          </h1>
          <div className="sys-online-tag px-2 py-0.5 rounded-full text-[10px] font-mono tracking-widest">
            <span className="sys-online-text">SYS.ONLINE</span>
          </div>

          {/* Logo - Cyberpunk Easter Egg Trigger (MOVED HERE) */}
          {/* 移除了 absolute 定位，放入了 flex 流中，位于 SYS.ONLINE 旁边 */}
          <button 
            onClick={handleLogoClick}
            className={`flex items-center justify-center p-1 ml-2 rounded hover:bg-white/10 transition-all duration-300 ${
              isTriggered ? 'scale-95' : ''
            }`}
            title="点击Logo 5次切换主题"
          >
            <Image 
              src={logoImage} 
              alt="智服云声" 
              width={24}  // 稍微调小一点以适应单行高度
              height={24} 
              className="rounded opacity-80 hover:opacity-100 transition-opacity"
            />
          </button>
        </div>
        
        {/* English Text - Won't be covered now */}
        <div className="text-[10px] text-slate-500 font-mono tracking-[0.2em] mt-1 pl-1">
          // ABYSSAL COMMAND DECK // V.2.0.4
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Data Center Entry Button (Replaces Notification) */}
        <div className="flex items-center gap-2">
           <button 
            onClick={() => window.location.href = ROUTES.DATA_CENTER}
            className="group flex items-center gap-2 rounded-lg border border-[#0284c7]/35 bg-[#0284c7]/10 px-4 py-2 text-[#0284c7] shadow-[0_0_10px_rgba(2,132,199,0.12)] transition-all duration-300 hover:bg-[#0284c7]/20 hover:text-[#0369a1] hover:shadow-[0_0_15px_rgba(2,132,199,0.22)] dark:border-[#0ea5e9]/50 dark:bg-[#0284c7]/15 dark:text-[#38bdf8] dark:hover:bg-[#0284c7]/25 dark:hover:text-[#7dd3fc]"
            title="进入数据中控台"
          >
            <LayoutDashboard className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span className="text-sm font-medium tracking-wide">数据中控台</span>
          </button>
        </div>
      </div>
    </header>
  );
}
