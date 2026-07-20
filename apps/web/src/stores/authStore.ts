import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { AuthState } from '@/types';
import { clearSession } from '@/lib/auth';

interface AuthStore extends AuthState {
  setAuthenticated: (userId: number, username: string) => void;
  setUnauthenticated: () => void;
  setLoading: (loading: boolean) => void;
  initialize: () => void;
}

const AUTH_VERSION = 2;

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        isAuthenticated: false,
        isLoading: true,
        userId: null,
        username: null,

        setAuthenticated: (userId: number, username: string) => {
          set({
            isAuthenticated: true,
            isLoading: false,
            userId,
            username,
          });
        },

        setUnauthenticated: () => {
          clearSession();
          set({
            isAuthenticated: false,
            isLoading: false,
            userId: null,
            username: null,
          });
        },

        setLoading: (loading: boolean) => {
          set({ isLoading: loading });
        },

        initialize: () => {
          set({
            isAuthenticated: false,
            isLoading: true,
          });
        },
      }),
      {
        name: 'auth-storage',
        version: AUTH_VERSION,
        partialize: (state) => ({
          userId: state.userId,
          username: state.username,
        }),
      }
    ),
    { name: 'auth-store' }
  )
);

export function useIsAuthenticated() {
  const { isAuthenticated, isLoading } = useAuthStore();
  return { isAuthenticated: isAuthenticated && !isLoading, isLoading };
}

export function initializeAuth() {
  useAuthStore.getState().initialize();
}
