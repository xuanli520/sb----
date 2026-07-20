import { describe, it, expect } from 'vitest';
import { can, canAny, canAll, hasRole, isSuperuser } from '../rbac';

describe('rbac utilities', () => {
  describe('can', () => {
    it('should return false for null user', () => {
      expect(can(null, 'read:user')).toBe(false);
    });

    it('should return false for undefined user', () => {
      expect(can(undefined, 'read:user')).toBe(false);
    });

    it('should return true for superuser', () => {
      const superuser = { is_superuser: true, permissions: [] };
      expect(can(superuser, 'any:permission')).toBe(true);
    });

    it('should check permission correctly', () => {
      const user = {
        is_superuser: false,
        permissions: ['read:user', 'write:user'],
      };
      expect(can(user, 'read:user')).toBe(true);
      expect(can(user, 'delete:user')).toBe(false);
    });
  });

  describe('canAny', () => {
    it('should return false for null user', () => {
      expect(canAny(null, ['read:user'])).toBe(false);
    });

    it('should return true if user has any of the permissions', () => {
      const user = { is_superuser: false, permissions: ['read:user'] };
      expect(canAny(user, ['read:user', 'write:user'])).toBe(true);
      expect(canAny(user, ['delete:user'])).toBe(false);
    });
  });

  describe('canAll', () => {
    it('should return false for null user', () => {
      expect(canAll(null, ['read:user'])).toBe(false);
    });

    it('should return true if user has all permissions', () => {
      const user = {
        is_superuser: false,
        permissions: ['read:user', 'write:user'],
      };
      expect(canAll(user, ['read:user', 'write:user'])).toBe(true);
      expect(canAll(user, ['read:user', 'delete:user'])).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return false for null user', () => {
      expect(hasRole(null, 'admin')).toBe(false);
    });

    it('should return true if user has the role', () => {
      const user = {
        is_superuser: false,
        permissions: [],
        roles: [{ name: 'admin', permissions: [] }],
      };
      expect(hasRole(user, 'admin')).toBe(true);
      expect(hasRole(user, 'editor')).toBe(false);
    });
  });

  describe('isSuperuser', () => {
    it('should return true for superuser', () => {
      expect(isSuperuser({ is_superuser: true })).toBe(true);
    });

    it('should return false for regular user', () => {
      expect(isSuperuser({ is_superuser: false })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isSuperuser(null)).toBe(false);
    });
  });
});
