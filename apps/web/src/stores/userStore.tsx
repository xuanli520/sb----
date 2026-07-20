'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { User, LoginParams } from '@/types/user';
import * as userService from '@/services/userService';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from './authStore';
import { initializePermissionStore, usePermissionStore } from './permissionStore';

interface UserState {
  currentUser: User | null;
  isLoading: boolean;
  error: string | null;
  isSuperuser: boolean;
}

interface UserActions {
  login: (params: LoginParams) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
}

type UserStore = UserState & UserActions;

const UserContext = createContext<UserStore | null>(null);

const PUBLIC_AUTH_ROUTES = ['/login', '/register'];

function isNovelRoute(pathname: string): boolean {
  return pathname === '/'
    || pathname === '/author'
    || pathname === '/novel-admin'
    || pathname.startsWith('/reader/');
}

function createInitialUserState(): UserState {
  return {
    currentUser: null,
    isLoading: false,
    error: null,
    isSuperuser: false,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isUnauthorizedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes('401') || error.message.includes('未授权');
}

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<UserState>(createInitialUserState);
  const hasInitializedRef = useRef(false);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const user = await userService.getCurrentUser();
        useAuthStore.getState().setAuthenticated(user.id, user.username);
        setState((prev) => ({
          ...prev,
          currentUser: {
            ...user,
            is_active: user.is_active ?? true,
            is_superuser: user.is_superuser ?? false,
            is_verified: user.is_verified ?? false,
          } as User,
          isSuperuser: user.is_superuser ?? false,
          isLoading: false,
          error: null,
        }));
        return;
      } catch (error: unknown) {
        lastError = error;
        if (isUnauthorizedError(error)) {
          useAuthStore.getState().setUnauthenticated();
          setState((prev) => ({
            ...prev,
            currentUser: null,
            isSuperuser: false,
            isLoading: false,
            error: null,
          }));
          return;
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }

    setState((prev) => ({
      ...prev,
      isLoading: false,
      error: getErrorMessage(lastError, '获取用户信息失败'),
    }));
    useAuthStore.getState().setLoading(false);
  }, []);

  const login = useCallback(async (params: LoginParams): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await userService.login(params);
      await fetchCurrentUser();

      if (!useAuthStore.getState().isAuthenticated) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: '登录状态验证失败',
        }));
        return false;
      }

      usePermissionStore.getState().clearPermissions();
      await initializePermissionStore();
      return true;
    } catch (error: unknown) {
      setState((prev) => ({
        ...prev,
        error: getErrorMessage(error, '登录失败'),
        isLoading: false,
      }));
      return false;
    }
  }, [fetchCurrentUser]);

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      await userService.logout();
    } catch {
    } finally {
      usePermissionStore.getState().clearPermissions();
      useAuthStore.getState().setUnauthenticated();
      setState(createInitialUserState());
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    const resolvedPathname =
      pathname || (typeof window !== 'undefined' ? window.location.pathname : '');

    if (!resolvedPathname) {
      return;
    }

    // The inherited dashboard provider talks to its former JWT API. Novel routes own their
    // authentication through the same-origin novel BFF and must not trigger that legacy flow.
    if (isNovelRoute(resolvedPathname)) {
      hasInitializedRef.current = false;
      usePermissionStore.getState().clearPermissions();
      useAuthStore.getState().setUnauthenticated();
      setState(createInitialUserState());
      return;
    }

    const isAuthPublicRoute = PUBLIC_AUTH_ROUTES.includes(resolvedPathname);

    if (isAuthPublicRoute) {
      hasInitializedRef.current = false;
      usePermissionStore.getState().clearPermissions();
      useAuthStore.getState().setUnauthenticated();
      setState(createInitialUserState());
      return;
    }

    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const initializeAuthState = async () => {
      useAuthStore.getState().initialize();
      await fetchCurrentUser();

      if (!useAuthStore.getState().isAuthenticated) {
        return;
      }

      await initializePermissionStore();
    };

    void initializeAuthState();
  }, [fetchCurrentUser, pathname]);

  const value: UserStore = {
    ...state,
    login,
    logout,
    fetchCurrentUser,
    clearError,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserStore() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserStore must be used within a UserProvider');
  }
  return context;
}
