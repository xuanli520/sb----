import { AdminWorkspacePage, type AdminWorkspaceView } from './AdminWorkspacePage';

export function AdminRoutePage({ view }: { view: AdminWorkspaceView }) {
  return <AdminWorkspacePage view={view} />;
}
