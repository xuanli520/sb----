/**
 * Sidebar组件 - 支持企业主题和赛博朋克彩蛋主题
 * 企业主题：固定200px，淡蓝背景，微软雅黑
 * 赛博朋克主题：可伸缩，深色背景，科技感
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Home, Settings, Calendar, Database, User, LogOut, ChevronUp, ChevronDown, Users, Shield, Key, Workflow, Activity, Bot } from 'lucide-react';
import profileImage from '@/assets/male.jpg';
import femaleProfileImage from '@/assets/female.jpg';
import logoImage from '@/assets/logo.png';
import { useUserStore } from '@/stores/userStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { useThemeStore } from '@/stores/themeStore';
import { useEasterEgg } from '@/hooks/useEasterEgg';
import { can, canAny } from '@/lib/rbac';
import { ROUTES } from '@/config/routes';

interface MenuItem {
  id: string;
  label: string;
  icon?: any;
  href?: string;
  perm?: string;
  subItems?: MenuItem[];
}

const menuItems: MenuItem[] = [
  { id: 'compass', label: '罗盘', icon: Home, href: ROUTES.COMPASS },
  { id: 'task-schedule', label: '任务调度', icon: Calendar, href: ROUTES.TASK_SCHEDULE },
  { id: 'agent-workbench', label: 'Agent 工作台', icon: Bot, href: ROUTES.AGENT_WORKBENCH },
  { id: 'data-source', label: '数据源管理', icon: Database, href: ROUTES.DATA_SOURCE },
  { id: 'scraping-rule', label: '采集规则', icon: Workflow, href: ROUTES.SCRAPING_RULE },
  // 系统管理
  {
    id: 'system-management',
    label: '系统管理',
    icon: Settings,
    subItems: [
      { id: 'admin-users', label: '用户管理', icon: Users, href: ROUTES.ADMIN_USERS, perm: 'user:read' },
      { id: 'admin-roles', label: '角色管理', icon: Shield, href: ROUTES.ADMIN_ROLES, perm: 'role:read' },
      { id: 'admin-permissions', label: '权限管理', icon: Key, href: ROUTES.ADMIN_PERMISSIONS, perm: 'permission:read' },
      { id: 'admin-login-audit', label: '登录审计', icon: Activity, href: ROUTES.ADMIN_LOGIN_AUDIT, perm: 'audit:read' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isUserMenuRendered, setIsUserMenuRendered] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['system-management']);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { currentUser, logout, isLoading } = useUserStore();
  const { isSuperuser, userPermissions, isLoading: permissionLoading } = usePermissionStore();
  const { appTheme, isHydrated } = useThemeStore();
  const { handleLogoClick } = useEasterEgg();

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showUserMenu && !isLoading) {
      setIsUserMenuRendered(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsUserMenuRendered(false);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [showUserMenu, isLoading]);

  // 鼠标移出侧边栏时收起子菜单（但保持在子菜单内时不收起）- 仅赛博朋克主题
  useEffect(() => {
    if (appTheme === 'enterprise') return;
    
    function handleMouseLeave(event: MouseEvent) {
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget && sidebarRef.current?.contains(relatedTarget)) {
        return;
      }
      setExpandedMenus([]);
    }
    const sidebar = sidebarRef.current;
    if (sidebar) {
      sidebar.addEventListener('mouseleave', handleMouseLeave);
    }
    return () => {
      if (sidebar) {
        sidebar.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [appTheme]);

  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      setLogoutError(null);
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
      setLogoutError('退出失败，请重试');
    }
  };

  // 获取用户角色显示文本
  const getRoleText = () => {
    if (isSuperuser) return '管理员';
    if (currentUser?.username) return currentUser.username;
    return '用户';
  };
  const shouldRenderUserMenu = isUserMenuRendered && !isLoading;
  const userMenuAnimationClass = showUserMenu
    ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
    : 'opacity-0 translate-y-1 scale-[0.98] pointer-events-none';

  // 等待权限和主题加载完成 - 使用固定的企业主题样式避免水合不匹配
  if (permissionLoading || !isHydrated) {
    return (
      <div
        ref={sidebarRef}
        className="h-[calc(100vh-32px)] my-4 ml-4 rounded-lg flex flex-col items-center justify-center z-50 w-[200px] bg-[#e0f2fe] dark:bg-[#0f172a] border border-[#bfdbfe] dark:border-[#1e293b]"
      >
        <div className="w-8 h-8 border-2 rounded-full animate-spin border-slate-300 border-t-[#0284c7]" />
      </div>
    );
  }

  // 企业主题侧边栏
  if (appTheme === 'enterprise') {
    return (
      <div 
        ref={sidebarRef} 
        className="sidebar-enterprise w-[200px] h-[calc(100vh-32px)] my-4 ml-4 rounded-lg bg-[#e0f2fe] dark:bg-[#0f172a] border border-[#bfdbfe] dark:border-[#1e293b] flex flex-col z-50 shadow-sm dark:shadow-[0_20px_45px_-18px_rgba(0,0,0,0.75)]"
      >
        {/* Logo区域 - 点击触发彩蛋 */}
        <div className="p-4 border-b border-[#bfdbfe] dark:border-[#1e293b]">
          <button 
            onClick={handleLogoClick}
            className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[#f0f9ff] dark:hover:bg-[#16263d] transition-colors"
            title="点击Logo 5次切换主题"
          >
            <Image 
               src={logoImage} 
               alt="智服云声" 
               width={44} 
               height={44}
               className="rounded"
             />
            <span className="text-sm font-semibold text-[#1e3a5a] dark:text-slate-100">智服云声</span>
          </button>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar">
          {menuItems.filter(item => {
            if (!item.perm) return true;
            return can({ is_superuser: isSuperuser, permissions: userPermissions }, item.perm);
          }).map((item) => {
            if (item.subItems) {
              const subItemPerms = item.subItems.map(sub => sub.perm).filter((p): p is string => !!p);
              if (!isSuperuser && !canAny({ is_superuser: isSuperuser, permissions: userPermissions }, subItemPerms)) {
                return null;
              }

              const isExpanded = expandedMenus.includes(item.id);
              const Icon = item.icon;
              const isAnyActive = item.subItems.some(subItem => subItem.href && pathname.startsWith(subItem.href));

              return (
                <div key={item.id} className="flex flex-col">
                  <button
                    onClick={() => toggleMenu(item.id)}
                    className={`relative px-4 py-3 mx-2 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                      isAnyActive
                        ? 'bg-[#0284c7] text-white shadow-sm'
                        : 'text-[#1e3a5a] dark:text-slate-200 hover:bg-[#f0f9ff] dark:hover:bg-[#16263d]'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-medium">{item.label}</span>
                    <ChevronDown
                      size={16}
                      className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="flex flex-col gap-1 mt-1 px-2">
                      {item.subItems.filter(subItem => {
                        if (!subItem.perm) return true;
                        return can({ is_superuser: isSuperuser, permissions: userPermissions }, subItem.perm);
                      }).map(subItem => {
                        const SubIcon = subItem.icon;
                        const isActive = subItem.href ? pathname.startsWith(subItem.href) : false;
                        return (
                          <Link
                            key={subItem.id}
href={subItem.href || '#'}
                            className={`relative px-4 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 text-sm ${
                              isActive
                                ? 'bg-[#0284c7]/10 dark:bg-[#0ea5e9]/20 text-[#0284c7] dark:text-[#0ea5e9] font-medium'
                                : 'text-[#475569] dark:text-slate-400 hover:bg-[#f0f9ff] dark:hover:bg-[#16263d] hover:text-[#1e3a5a] dark:hover:text-slate-100'
                            }`}
                          >
                            <SubIcon size={16} />
                            <span>{subItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const Icon = item.icon;
            const isActive = item.href ? pathname.startsWith(item.href) : false;
            return (
              <Link
                key={item.id}
                href={item.href || '#'}
                className={`relative px-4 py-3 mx-2 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0284c7] text-white shadow-sm'
                    : 'text-[#1e3a5a] dark:text-slate-200 hover:bg-[#f0f9ff] dark:hover:bg-[#16263d]'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 用户信息区域 */}
        <div className="border-t border-[#bfdbfe] dark:border-[#1e293b] p-3" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`w-full p-2 rounded-lg flex items-center gap-3 transition-all duration-200 ${
              showUserMenu ? 'bg-[#f0f9ff] dark:bg-[#16263d]' : 'hover:bg-[#f0f9ff] dark:hover:bg-[#16263d]'
            }`}
          >
            {isLoading ? (
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-[#f0f9ff] dark:bg-[#16263d]">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-[#0ea5e9] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#bfdbfe] dark:ring-[#334155]">
                <Image
                  src={currentUser?.gender === 'female' ? femaleProfileImage : profileImage}
                  alt="用户头像"
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 text-left overflow-hidden">
              <div className="text-sm font-semibold text-[#1e3a5a] dark:text-slate-100 truncate">
                {isLoading ? '加载中...' : getRoleText()}
              </div>
              <div className="text-xs text-[#64748b] dark:text-slate-400 truncate">
                {isLoading ? '请稍候' : (isSuperuser ? '管理员' : '在线')}
              </div>
            </div>
            <ChevronUp
              size={16}
              className={`text-[#64748b] dark:text-slate-400 transition-transform ${showUserMenu ? 'rotate-180 text-[#0ea5e9] dark:text-[#38bdf8]' : ''}`}
            />
          </button>

          {/* 用户菜单弹窗 */}
          {shouldRenderUserMenu && (
            <div
              aria-hidden={!showUserMenu}
              className={`ui-fade-transform-200 absolute bottom-20 left-4 w-[180px] origin-bottom-left bg-white dark:bg-[#0f172a] rounded-lg shadow-lg dark:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-[#1e293b] overflow-hidden z-50 ${userMenuAnimationClass}`}
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-[#1e293b]">
                <div className="text-sm font-medium text-[#1e3a5a] dark:text-slate-100">
                  {currentUser?.username || '未知用户'}
                </div>
                <div className="text-xs text-[#64748b] dark:text-slate-400 mt-0.5">
                  {currentUser?.email || '无邮箱'}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  router.push('/profile');
                }}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-[#475569] dark:text-slate-300 hover:bg-[#f0f9ff] dark:hover:bg-[#16263d] hover:text-[#0ea5e9] dark:hover:text-[#38bdf8] transition-colors border-b border-slate-100 dark:border-[#1e293b]"
              >
                <User size={16} />
                <span>个人信息</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  router.push('/system-settings');
                }}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-[#475569] dark:text-slate-300 hover:bg-[#f0f9ff] dark:hover:bg-[#16263d] hover:text-[#0ea5e9] dark:hover:text-[#38bdf8] transition-colors border-b border-slate-100 dark:border-[#1e293b]"
              >
                <Settings size={16} />
                <span>系统设置</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={16} />
                <span>退出登录</span>
              </button>
              {logoutError && (
                <div className="px-4 py-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10">
                  {logoutError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 赛博朋克主题侧边栏
  return (
    <div 
      ref={sidebarRef} 
      className="sidebar-cyberpunk w-[80px] hover:w-[240px] transition-all duration-300 ease-cubic-bezier(0.4, 0, 0.2, 1) h-[calc(100vh-32px)] my-4 ml-4 rounded-xl bg-white/80 dark:bg-[#0a101f]/60 backdrop-blur-xl border border-slate-200 dark:border-white/5 flex flex-col z-50 shadow-sm dark:shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] group overflow-hidden"
    >
      {/* Decorative Glow */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#C8FDE6]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <nav className="flex-1 min-h-0 py-6 flex flex-col gap-2 overflow-y-auto overflow-x-hidden sidebar-scrollbar">
        {menuItems.filter(item => {
          if (!item.perm) return true;
          return can({ is_superuser: isSuperuser, permissions: userPermissions }, item.perm);
        }).map((item) => {
          if (item.subItems) {
            const subItemPerms = item.subItems.map(sub => sub.perm).filter((p): p is string => !!p);
            if (!isSuperuser && !canAny({ is_superuser: isSuperuser, permissions: userPermissions }, subItemPerms)) {
              return null;
            }

            const isExpanded = expandedMenus.includes(item.id);
            const Icon = item.icon;
            const isAnyActive = item.subItems.some(subItem => subItem.href && pathname.startsWith(subItem.href));

            return (
              <div key={item.id} className="flex flex-col">
                <button
                  onClick={() => toggleMenu(item.id)}
                  className={`relative px-4 py-3 mx-3 rounded-xl flex items-center gap-4 transition-all duration-300 group/item overflow-hidden ${
                    isAnyActive
                      ? 'bg-gradient-to-r from-[#C8FDE6]/30 to-[#F4D5BD]/30 text-slate-900 dark:text-[#C8FDE6] shadow-sm dark:shadow-[0_0_20px_rgba(200,253,230,0.15)] border border-[#C8FDE6]/40'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#C8FDE6] hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {isAnyActive && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-[#C8FDE6] rounded-full shadow-[0_0_10px_#C8FDE6]" />
                  )}
                  <Icon size={20} className={`flex-shrink-0 transition-transform duration-300 ${isAnyActive ? 'scale-110 drop-shadow-md dark:drop-shadow-[0_0_8px_rgba(200,253,230,0.5)]' : 'group-hover/item:scale-110'}`} />
                  <span className={`menu-text whitespace-nowrap font-medium tracking-wide ${isAnyActive ? 'text-slate-900 dark:text-[#C8FDE6]' : ''}`}>
                    {item.label}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 transition-transform duration-300 menu-text ml-auto ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-1 mt-1 px-3">
                    {item.subItems.filter(subItem => {
                      if (!subItem.perm) return true;
                      return can({ is_superuser: isSuperuser, permissions: userPermissions }, subItem.perm);
                    }).map(subItem => {
                      const SubIcon = subItem.icon;
                      const isActive = subItem.href ? pathname.startsWith(subItem.href) : false;
                      return (
                        <Link
                          key={subItem.id}
                          href={subItem.href || '#'}
                          className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-300 group/subitem ${
                            isActive
                              ? 'bg-gradient-to-r from-[#C8FDE6]/20 to-[#F4D5BD]/20 text-slate-900 dark:text-[#C8FDE6] shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#C8FDE6] hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {isActive && (
                            <div className="absolute inset-y-0 left-0 w-1 bg-[#C8FDE6] rounded-full shadow-[0_0_10px_#C8FDE6]" />
                          )}
                          <SubIcon size={20} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-105 drop-shadow-[0_0_8px_rgba(200,253,230,0.5)]' : 'group-hover/subitem:scale-105'}`} />
                          <span className={`menu-text whitespace-nowrap font-medium tracking-wide ${isActive ? 'text-slate-900 dark:text-[#C8FDE6]' : ''}`}>
                            {subItem.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = item.href ? pathname.startsWith(item.href) : false;
          return (
            <Link
              key={item.id}
              href={item.href || '#'}
              className={`relative px-4 py-3 mx-3 rounded-xl flex items-center gap-4 transition-all duration-300 group/item overflow-hidden ${
                isActive
                  ? 'bg-gradient-to-r from-[#C8FDE6]/30 to-[#F4D5BD]/30 text-slate-900 dark:text-[#C8FDE6] shadow-sm dark:shadow-[0_0_20px_rgba(200,253,230,0.15)] border border-[#C8FDE6]/40'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#C8FDE6] hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {isActive && (
                <div className="absolute inset-y-0 left-0 w-1 bg-[#C8FDE6] rounded-full shadow-[0_0_10px_#C8FDE6]" />
              )}
              <Icon size={20} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md dark:drop-shadow-[0_0_8px_rgba(200,253,230,0.5)]' : 'group-hover/item:scale-110'}`} />
              <span className={`menu-text whitespace-nowrap font-medium tracking-wide ${isActive ? 'text-slate-900 dark:text-[#C8FDE6]' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* 用户信息区域 */}
      <div className="relative border-t border-slate-200 dark:border-white/5 p-3" ref={userMenuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className={`w-full p-2 rounded-xl flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-300 ${showUserMenu ? 'bg-slate-100 dark:bg-white/5' : ''}`}
        >
          {isLoading ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-white/5 ring-2 ring-slate-200 dark:ring-white/10">
              <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-slate-200 dark:ring-white/10 transition-all shadow-md ${
              currentUser?.gender === 'female'
                ? 'group-hover:ring-pink-400/50 shadow-pink-400/20'
                : 'group-hover:ring-[#C8FDE6]/50'
            }`}>
              <Image
                src={currentUser?.gender === 'female' ? femaleProfileImage : profileImage}
                alt="用户头像"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 text-left overflow-hidden menu-text">
            <div className="text-sm font-bold text-slate-700 dark:text-gray-200 truncate font-mono">
              {isLoading ? '加载中...' : getRoleText()}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-[#C8FDE6]/70 truncate tracking-wider">
              {isLoading ? '请稍候' : (isSuperuser ? '超级用户' : '在线')}
            </div>
          </div>
          <ChevronUp
            size={16}
            className={`text-slate-400 dark:text-gray-500 transition-transform flex-shrink-0 menu-text ${showUserMenu ? 'rotate-180 text-slate-700 dark:text-[#C8FDE6]' : ''}`}
          />
        </button>

        {/* 用户菜单弹窗 */}
        {shouldRenderUserMenu && (
          <div
            aria-hidden={!showUserMenu}
            className={`ui-fade-transform-200 absolute bottom-full left-0 w-[220px] mb-2 origin-bottom-left bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-xl rounded-xl shadow-lg dark:shadow-[0_0_30px_-5px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-white/10 overflow-hidden z-50 ${userMenuAnimationClass}`}
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
              <div className="text-sm font-medium text-slate-700 dark:text-gray-200">
                {currentUser?.username || '未知用户'}
              </div>
              <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                {currentUser?.email || '无邮箱'}
              </div>
            </div>
            <button
              onClick={() => {
                setShowUserMenu(false);
                router.push('/profile');
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-600 dark:text-gray-300 hover:bg-[#C8FDE6]/10 hover:text-slate-900 dark:hover:text-[#C8FDE6] transition-colors border-b border-slate-100 dark:border-white/5"
            >
              <User size={16} />
              <span>个人信息</span>
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                router.push('/system-settings');
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-600 dark:text-gray-300 hover:bg-[#C8FDE6]/10 hover:text-slate-900 dark:hover:text-[#C8FDE6] transition-colors border-b border-slate-100 dark:border-white/5"
            >
              <Settings size={16} />
              <span>系统设置</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-red-500 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
            {logoutError && (
              <div className="px-4 py-2 text-xs text-red-500 dark:text-red-400 bg-red-500/10">
                {logoutError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
