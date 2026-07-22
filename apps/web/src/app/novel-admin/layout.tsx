import { type ReactNode } from 'react';
import { AdminWorkspaceLayout } from '@/components/novel/admin/AdminWorkspaceLayout';
import { NovelShell } from '@/components/novel/NovelShell';

export default function NovelAdminLayout({ children }: { children: ReactNode }) {
  return <NovelShell workspace="admin"><AdminWorkspaceLayout>{children}</AdminWorkspaceLayout></NovelShell>;
}
