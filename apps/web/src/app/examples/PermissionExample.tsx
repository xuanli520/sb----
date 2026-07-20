'use client';

import { PermissionGate, PermissionGates } from '@/components/auth/PermissionGate';
import { PermissionButton } from '@/components/auth/PermissionButton';
import { usePermissionCheck, useAuthCheck } from '@/lib/rbac';

export function PermissionExample() {
  const { can, canAny, isSuperuser, isAuthenticated } = usePermissionCheck();
  const { isAuthenticated: authStatus, isLoading } = useAuthCheck();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">权限控制示例</h1>

      <section>
        <h2 className="text-xl font-semibold mb-4">认证状态</h2>
        <p>登录状态: {authStatus ? '✓ 已登录' : '✗ 未登录'}</p>
        <p>加载状态: {isLoading ? '加载中...' : '完成'}</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">使用 PermissionGate (mode=hide)</h2>
        <PermissionGate permission="edit:user" fallback={<span className="text-red-500">无权编辑用户</span>}>
          <button className="bg-blue-500 text-white px-4 py-2 rounded">编辑用户按钮</button>
        </PermissionGate>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">使用 PermissionGate (mode=visible-disabled)</h2>
        <PermissionGate permission="delete:user" mode="visible-disabled">
          <button className="bg-red-500 text-white px-4 py-2 rounded">删除用户</button>
        </PermissionGate>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">使用 PermissionButton</h2>
        <PermissionButton
          permission="export:data"
          className="bg-green-500 text-white px-4 py-2 rounded"
          mode="visible-disabled"
        >
          导出数据
        </PermissionButton>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">多权限检查 (AND)</h2>
        <PermissionGates permissions={['edit:user', 'delete:user']} operator="and">
          <button className="bg-purple-500 text-white px-4 py-2 rounded">
            高级编辑 (需要编辑+删除权限)
          </button>
        </PermissionGates>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">多权限检查 (OR)</h2>
        <PermissionGates permissions={['edit:user', 'delete:user']} operator="or">
          <button className="bg-orange-500 text-white px-4 py-2 rounded">
            基础操作 (需要编辑或删除权限)
          </button>
        </PermissionGates>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">使用 Hook API</h2>
        <div className="space-y-2">
          <p>当前用户权限检查:</p>
          <ul className="list-disc list-inside">
            <li>编辑用户权限: {can('edit:user') ? '✓' : '✗'}</li>
            <li>删除用户权限: {can('delete:user') ? '✓' : '✗'}</li>
            <li>导出数据权限: {can('export:data') ? '✓' : '✗'}</li>
            <li>是否为超级管理员: {isSuperuser ? '✓' : '✗'}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
