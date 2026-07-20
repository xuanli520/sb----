import { vi } from 'vitest';

const mockedPathname = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => mockedPathname(),
}));

vi.mock('@/services/userService', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../permissionStore', async () => {
  const actual = await vi.importActual<typeof import('../permissionStore')>('../permissionStore');
  return {
    ...actual,
    initializePermissionStore: vi.fn().mockResolvedValue(undefined),
  };
});

import { render, waitFor, cleanup } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, expect, type Mock } from 'vitest';
import { useAuthStore } from '../authStore';
import { usePermissionStore } from '../permissionStore';
import { UserProvider } from '../userStore';

describe('UserProvider auth initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockedPathname.mockReset();
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      userId: null,
      username: null,
    });
    usePermissionStore.setState({
      permissions: [],
      allRoles: [],
      userRoles: [],
      userPermissions: [],
      resourcePermissions: [],
      isSuperuser: false,
      isLoading: false,
      error: null,
      lastFetched: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('skips current user probe on public auth routes', async () => {
    mockedPathname.mockReturnValue('/login');
    const userService = await import('@/services/userService');
    const clearPermissionsSpy = vi.spyOn(usePermissionStore.getState(), 'clearPermissions');

    render(
      <UserProvider>
        <div />
      </UserProvider>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
    expect(clearPermissionsSpy).toHaveBeenCalled();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('fetches current user on protected routes', async () => {
    mockedPathname.mockReturnValue('/dashboard');
    const userService = await import('@/services/userService');
    const getCurrentUser = userService.getCurrentUser as Mock;
    getCurrentUser.mockResolvedValue({
      id: 1,
      username: 'tester',
    });

    render(
      <UserProvider>
        <div />
      </UserProvider>
    );

    await waitFor(() => {
      expect(userService.getCurrentUser).toHaveBeenCalled();
    });
  });

  it('pathname 未就绪时仍应按 window.location 跳过登录页探测', async () => {
    mockedPathname.mockReturnValue('');
    window.location.pathname = '/login';
    const userService = await import('@/services/userService');
    const clearPermissionsSpy = vi.spyOn(usePermissionStore.getState(), 'clearPermissions');

    render(
      <UserProvider>
        <div />
      </UserProvider>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
    expect(clearPermissionsSpy).toHaveBeenCalled();
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
  });
});
