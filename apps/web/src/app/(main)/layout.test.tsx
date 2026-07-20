import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import MainLayout from '@/app/(main)/layout';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { useThemeStore } from '@/stores/themeStore';

const { pathnameMock, routerReplaceMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => '/compass'),
  routerReplaceMock: vi.fn(),
}));

vi.mock('@/components/layout/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

describe('MainLayout theme readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    pathnameMock.mockReturnValue('/compass');
    useThemeStore.setState({
      appTheme: 'enterprise',
      colorMode: 'system',
      isHydrated: false,
      isLoading: true,
    });
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      userId: 1,
      username: 'devadmin',
    });
    usePermissionStore.setState({
      isLoading: false,
      isSuperuser: true,
      userPermissions: [],
      userRoles: [],
      resourcePermissions: [],
    });
  });

  it('does not render layout content when theme is not hydrated', () => {
    const { container, queryByTestId } = render(
      <MainLayout>
        <div data-testid="content" />
      </MainLayout>
    );

    expect(container).toBeTruthy();
    expect(queryByTestId('header')).toBeNull();
    expect(queryByTestId('sidebar')).toBeNull();
    expect(queryByTestId('content')).toBeNull();
  });

  it('renders layout content after hydration', () => {
    useThemeStore.setState({
      isHydrated: true,
      isLoading: false,
      appTheme: 'enterprise',
    });

    const { getByTestId } = render(
      <MainLayout>
        <div data-testid="content" />
      </MainLayout>
    );

    expect(getByTestId('header')).toBeTruthy();
    expect(getByTestId('sidebar')).toBeTruthy();
    expect(getByTestId('content')).toBeTruthy();
  });

  it('redirects authenticated users without page permission to forbidden page', async () => {
    pathnameMock.mockReturnValue('/admin/users');
    useThemeStore.setState({
      isHydrated: true,
      isLoading: false,
      appTheme: 'enterprise',
    });
    usePermissionStore.setState({
      isSuperuser: false,
      userPermissions: [],
      userRoles: [],
      resourcePermissions: [],
      isLoading: false,
    });

    render(
      <MainLayout>
        <div data-testid="content" />
      </MainLayout>
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(routerReplaceMock).toHaveBeenCalledWith('/403');
  });
});
