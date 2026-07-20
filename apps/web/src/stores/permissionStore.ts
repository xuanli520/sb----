import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { Permission, Role, PermissionCode, ResourcePermission } from '@/types';
import * as permissionService from '@/services/permissionService';
import { RBAC_CONFIG } from '@/config/rbac';

const PERMISSION_VERSION = 2;
const PERMISSION_CACHE_DURATION = RBAC_CONFIG.CACHE.PERMISSION_CACHE_DURATION;

interface PermissionState {
  permissions: Permission[];
  allRoles: Role[];
  userRoles: Role[];
  userPermissions: PermissionCode[];
  resourcePermissions: ResourcePermission[];
  isSuperuser: boolean;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

interface PermissionActions {
  fetchPermissions: () => Promise<void>;
  fetchAllRoles: () => Promise<void>;
  fetchUserPermissions: () => Promise<void>;
  checkPermission: (permission: PermissionCode) => boolean;
  checkAnyPermission: (permissions: PermissionCode[]) => boolean;
  checkAllPermissions: (permissions: PermissionCode[]) => boolean;
  checkRole: (roleName: string) => boolean;
  checkResourcePermission: (resource: ResourcePermission) => boolean;
  clearPermissions: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type PermissionStore = PermissionState & PermissionActions;

export const migratePermissionStore = (persistState: unknown, version: number): PermissionState => {
  const state = persistState as Partial<PermissionState>;

  if (version < 2) {
    return {
      ...state,
      userRoles: state.userRoles || [],
      resourcePermissions: [],
      lastFetched: null,
    } as PermissionState;
  }

  return state as PermissionState;
};

const isCacheValid = (lastFetched: number | null) =>
  !!lastFetched && Date.now() - lastFetched < PERMISSION_CACHE_DURATION;

export const usePermissionStore = create<PermissionStore>()(
  devtools(
    persist(
      (set, get) => ({
        permissions: [],
        allRoles: [],
        userRoles: [],
        userPermissions: [],
        resourcePermissions: [],
        isSuperuser: false,
        isLoading: false,
        error: null,
        lastFetched: null,

        fetchPermissions: async () => {
          const { lastFetched, permissions } = get();
          if (isCacheValid(lastFetched) && permissions.length > 0) return;

          set({ isLoading: true, error: null });
          try {
            const response = await permissionService.getPermissions(1, 100);
            set({
              permissions: response.items || [],
              lastFetched: Date.now(),
              isLoading: false,
            });
          } catch (error) {
            set({ error: 'Failed to fetch permissions', isLoading: false });
            throw error;
          }
        },

        fetchAllRoles: async () => {
          const { lastFetched, allRoles } = get();
          if (isCacheValid(lastFetched) && allRoles.length > 0) return;

          set({ isLoading: true, error: null });
          try {
            const response = await permissionService.getRoles(1, 100);
            set({
              allRoles: response.items || [],
              lastFetched: Date.now(),
              isLoading: false,
            });
          } catch (error) {
            set({ error: 'Failed to fetch roles', isLoading: false });
            throw error;
          }
        },

        fetchUserPermissions: async () => {
          const { lastFetched, userPermissions } = get();
          if (isCacheValid(lastFetched) && userPermissions.length > 0) return;

          set({ isLoading: true, error: null });
          try {
            const data = await permissionService.getMyPermissions();
            set({
              userRoles: data.roles || [],
              userPermissions: data.permissions || [],
              isSuperuser: data.is_superuser || false,
              lastFetched: Date.now(),
              isLoading: false,
            });
          } catch (error) {
            set({ error: 'Failed to fetch user permissions', isLoading: false });
            throw error;
          }
        },

        checkPermission: (permission: PermissionCode) => {
          const { isSuperuser, userPermissions, resourcePermissions } = get();
          if (isSuperuser) return true;
          if (userPermissions.includes(permission)) return true;

          return resourcePermissions.some(
            rp => rp.resource === permission
          );
        },

        checkAnyPermission: (permissions: PermissionCode[]) => {
          const { isSuperuser, userPermissions } = get();
          if (isSuperuser) return true;
          return permissions.some((p) => userPermissions.includes(p));
        },

        checkAllPermissions: (permissions: PermissionCode[]) => {
          const { isSuperuser, userPermissions } = get();
          if (isSuperuser) return true;
          return permissions.every((p) => userPermissions.includes(p));
        },

        checkRole: (roleName: string) => {
          const { isSuperuser, userRoles } = get();
          if (isSuperuser) return true;
          return userRoles.some((r) => r.name === roleName);
        },

        checkResourcePermission: (resource: ResourcePermission) => {
          const { isSuperuser, resourcePermissions, userPermissions } = get();
          if (isSuperuser) return true;

          return resourcePermissions.some(
            rp => rp.resource === resource.resource &&
              (!resource.action || rp.action === resource.action) &&
              (!resource.scope || rp.scope === resource.scope)
          ) || userPermissions.includes(resource.resource as PermissionCode);
        },

        clearPermissions: () => {
          set({
            permissions: [],
            allRoles: [],
            userRoles: [],
            userPermissions: [],
            resourcePermissions: [],
            isSuperuser: false,
            error: null,
            lastFetched: null,
          });
        },

        setLoading: (loading: boolean) => set({ isLoading: loading }),
        setError: (error: string | null) => set({ error }),
      }),
      {
        name: 'permission-storage',
        version: PERMISSION_VERSION,
        storage: createJSONStorage(() => localStorage),
        migrate: migratePermissionStore,
        partialize: (state) => ({
          userPermissions: state.userPermissions,
          isSuperuser: state.isSuperuser,
          userRoles: state.userRoles,
        }),
      }
    ),
    { name: 'permission-store' }
  )
);

export async function initializePermissionStore() {
  const { fetchPermissions, fetchAllRoles, fetchUserPermissions, setLoading } = usePermissionStore.getState();

  setLoading(true);

  const results = await Promise.allSettled([
    fetchPermissions(),
    fetchAllRoles(),
    fetchUserPermissions(),
  ]);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const label = ['fetchPermissions', 'fetchAllRoles', 'fetchUserPermissions'][index];
      console.warn(`[initializePermissionStore] ${label} failed:`, result.reason);
    }
  });

  setLoading(false);

  import('./authStore').then(({ useAuthStore }) => {
    useAuthStore.getState().setLoading(false);
  }).catch(() => {});
}
