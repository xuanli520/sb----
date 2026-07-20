/**
 * 主布局 - 支持企业主题和赛博朋克彩蛋主题
 * 根据主题显示不同的背景效果
 */

'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useThemeStore } from '@/stores/themeStore';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { matchRoutePermission } from '@/config/permissions';
import { RBAC_CONFIG } from '@/config/rbac';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/stores/permissionStore';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appTheme, isHydrated } = useThemeStore();
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    isLoading: permissionLoading,
    checkAllPermissions,
    checkRole,
    checkResourcePermission,
  } = usePermissionStore();
  const isDataCenterPage = pathname.startsWith('/data-center');
  const [isDataCenterNavOpen, setIsDataCenterNavOpen] = useState(false);
  const routeConfig = matchRoutePermission(pathname);
  const hasRequiredPermissions = routeConfig?.requiredPermissions?.length
    ? checkAllPermissions(routeConfig.requiredPermissions)
    : true;
  const hasRequiredRoles = routeConfig?.requiredRoles?.length
    ? routeConfig.requiredRoles.every(role => checkRole(role))
    : true;
  const hasRequiredResources = routeConfig?.requiredResources?.length
    ? routeConfig.requiredResources.every(resource => checkResourcePermission(resource))
    : true;
  const hasPageAccess = !routeConfig || (
    isAuthenticated &&
    hasRequiredPermissions &&
    hasRequiredRoles &&
    hasRequiredResources
  );

  useEffect(() => {
    if (!isDataCenterPage) {
      setIsDataCenterNavOpen(false);
    }
  }, [isDataCenterPage]);

  useEffect(() => {
    if (authLoading || permissionLoading) {
      return;
    }

    if (!routeConfig) {
      return;
    }

    if (!isAuthenticated) {
      const loginUrl = new URL(
        routeConfig.unauthRedirect || RBAC_CONFIG.ROUTING.DEFAULT_UNAUTH_REDIRECT,
        window.location.origin,
      );
      loginUrl.searchParams.set('redirect', pathname);
      router.replace(`${loginUrl.pathname}${loginUrl.search}`);
      return;
    }

    if (!hasPageAccess) {
      router.replace(routeConfig.forbiddenRedirect || RBAC_CONFIG.ROUTING.DEFAULT_FORBIDDEN_REDIRECT);
    }
  }, [
    authLoading,
    hasPageAccess,
    isAuthenticated,
    pathname,
    permissionLoading,
    routeConfig,
    router,
  ]);

  if (!isHydrated || authLoading || permissionLoading || !hasPageAccess) {
    return <div className="flex h-screen bg-background" />;
  }

  const sidebarContent = isDataCenterPage ? (
    <>
      <button
        type="button"
        aria-label="关闭导航遮罩"
        aria-hidden={!isDataCenterNavOpen}
        tabIndex={isDataCenterNavOpen ? 0 : -1}
        className={`ui-fade-opacity-300 fixed inset-0 z-[55] bg-slate-950/20 backdrop-blur-[1px] dark:bg-black/45 ${
          isDataCenterNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsDataCenterNavOpen(false)}
      />
      <div
        aria-hidden={!isDataCenterNavOpen}
        className={`ui-fade-transform-300 fixed inset-y-0 left-0 z-[70] flex h-full will-change-[opacity,transform] ${
          isDataCenterNavOpen ? 'translate-x-0 opacity-100' : '-translate-x-[240px] opacity-0 pointer-events-none'
        }`}
      >
        <Sidebar />
      </div>
      <button
        type="button"
        aria-label={isDataCenterNavOpen ? '收起导航栏' : '展开导航栏'}
        title={isDataCenterNavOpen ? '收起导航栏' : '展开导航栏'}
        onClick={() => setIsDataCenterNavOpen((open) => !open)}
        className={`fixed bottom-6 z-[80] inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all duration-300 ${
          isDataCenterNavOpen ? 'left-[220px]' : 'left-6'
        } ${
          appTheme === 'enterprise'
            ? 'border-[#0284c7]/30 bg-white text-[#0284c7] hover:bg-[#e0f2fe] dark:border-[#0ea5e9]/45 dark:bg-[#0f172a] dark:text-[#38bdf8] dark:hover:bg-[#16263d]'
            : 'border-[#0284c7]/35 bg-white/95 text-[#0284c7] backdrop-blur hover:bg-[#e0f2fe] dark:border-[#0ea5e9]/50 dark:bg-[#0a101f]/90 dark:text-[#38bdf8] dark:hover:bg-[#0284c7]/20'
        }`}
      >
        {isDataCenterNavOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
      </button>
    </>
  ) : (
    <div className="relative z-10 flex h-full">
      <Sidebar />
    </div>
  );

  // 企业主题布局 - 简洁专业风格
  if (appTheme === 'enterprise') {
    return (
      <div className="enterprise-main-layout flex h-screen bg-background text-foreground relative overflow-hidden transition-colors duration-300">
        {/* 企业主题背景 - 简洁淡蓝渐变 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#e0f2fe]/30 via-[#f8fafc] to-[#f0f9ff] dark:from-[#10233b]/60 dark:via-[#0b1423] dark:to-[#111b2a] z-0 pointer-events-none transition-colors duration-300" />

        {/* 侧边栏 */}
        {sidebarContent}

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden relative z-10">
          {/* 顶部导航栏 */}
          <Header />

          {/* 页面内容 */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // 赛博朋克主题布局 - 科技感霓虹风格
  return (
    <div className="flex h-screen bg-background text-foreground relative overflow-hidden">
      {/* 赛博朋克背景 - 霓虹光效 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#C8FDE6]/30 via-background to-background dark:from-[#1a2c4e] dark:via-[#02040a] dark:to-[#02040a] opacity-60 dark:opacity-40 z-0 pointer-events-none" />

      {/* 侧边栏 */}
      {sidebarContent}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* 背景光效 */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-30 dark:opacity-40 overflow-hidden">
           <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary blur-[120px] opacity-20 animate-pulse"></div>
           <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-secondary blur-[150px] opacity-20"></div>
        </div>

        {/* 顶部导航栏 */}
        <Header />

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
