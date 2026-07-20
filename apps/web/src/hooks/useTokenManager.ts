'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSession } from '@/lib/auth';
import { refreshToken } from '@/services/userService';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

const REFRESH_BEFORE_EXPIRY = 60 * 29;

interface UseTokenManagerReturn {
  isAuthenticated: boolean;
  refreshTimer: React.MutableRefObject<NodeJS.Timeout | null>;
  startRefreshTimer: () => void;
  clearRefreshTimer: () => void;
  manualRefresh: () => Promise<void>;
}

export function useTokenManager(): UseTokenManagerReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const authIsAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    setIsAuthenticated(authIsAuthenticated);
  }, [authIsAuthenticated]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  const startRefreshTimer = useCallback(() => {
    clearRefreshTimer();

    if (!useAuthStore.getState().isAuthenticated) {
      return;
    }

    const refreshDelay = REFRESH_BEFORE_EXPIRY * 1000;

    refreshTimer.current = setTimeout(async () => {
      try {
        await refreshToken();
        startRefreshTimer();
      } catch {
        clearSession();
        setIsAuthenticated(false);
        router.push('/login?reason=session_expired');
      }
    }, refreshDelay);
  }, [clearRefreshTimer, router]);

  const manualRefresh = useCallback(async () => {
    await refreshToken();
    startRefreshTimer();
  }, [startRefreshTimer]);

  useEffect(() => () => {
    clearRefreshTimer();
  }, [clearRefreshTimer]);

  return {
    isAuthenticated,
    refreshTimer,
    startRefreshTimer,
    clearRefreshTimer,
    manualRefresh,
  };
}

class TokenRefreshManager {
  private static instance: TokenRefreshManager;
  private timer: NodeJS.Timeout | null = null;
  private refreshCallback: (() => Promise<void>) | null = null;

  private constructor() {}

  static getInstance(): TokenRefreshManager {
    if (!TokenRefreshManager.instance) {
      TokenRefreshManager.instance = new TokenRefreshManager();
    }
    return TokenRefreshManager.instance;
  }

  start(callback: () => Promise<void>): void {
    this.stop();
    this.refreshCallback = callback;

    const delay = REFRESH_BEFORE_EXPIRY * 1000;
    this.timer = setTimeout(async () => {
      try {
        await callback();
        this.start(callback);
      } catch {
        this.stop();
      }
    }, delay);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.refreshCallback = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

export const tokenRefreshManager = TokenRefreshManager.getInstance();
