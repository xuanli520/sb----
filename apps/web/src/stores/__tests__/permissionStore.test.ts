import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { usePermissionStore } from '../permissionStore';
import * as permissionService from '@/services/permissionService';

vi.mock('@/services/permissionService');

describe('permissionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    cleanup();
  });

  afterEach(() => {
    act(() => {
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
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => usePermissionStore());
    expect(result.current.userPermissions).toEqual([]);
    expect(result.current.userRoles).toEqual([]);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should check permission correctly', () => {
    const { result } = renderHook(() => usePermissionStore());
    
    act(() => {
      usePermissionStore.setState({
        userPermissions: ['read:user', 'write:user'],
        isSuperuser: false,
      });
    });
    
    expect(result.current.checkPermission('read:user')).toBe(true);
    expect(result.current.checkPermission('delete:user')).toBe(false);
  });

  it('should return true for superuser regardless of permissions', () => {
    const { result } = renderHook(() => usePermissionStore());
    
    act(() => {
      usePermissionStore.setState({
        userPermissions: [],
        isSuperuser: true,
      });
    });
    
    expect(result.current.checkPermission('any:permission')).toBe(true);
  });

  it('should check role correctly', () => {
    const { result } = renderHook(() => usePermissionStore());
    
    act(() => {
      usePermissionStore.setState({
        userRoles: [
          { id: 1, name: 'admin', permissions: [], is_system: true, created_at: '', updated_at: '' },
        ],
      });
    });
    
    expect(result.current.checkRole('admin')).toBe(true);
    expect(result.current.checkRole('editor')).toBe(false);
  });

  it('should migrate from v1 to v2', async () => {
    const { migratePermissionStore } = await import('../permissionStore');

    const migratedState = {
      permissions: [],
      allRoles: [],
      userRoles: [],
      userPermissions: ['read:user'],
      resourcePermissions: [],
      isSuperuser: false,
      isLoading: false,
      error: null,
      lastFetched: null,
      _version: 1,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = migratePermissionStore(migratedState as any, 1);

    expect(result.userRoles).toEqual([]);
    expect(result.resourcePermissions).toEqual([]);
    expect(result.lastFetched).toBeNull();
  });
});
