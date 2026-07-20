export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
    permissions: () => [...queryKeys.auth.all, 'permissions'] as const,
  },
  dataSources: {
    all: ['dataSources'] as const,
    lists: () => [...queryKeys.dataSources.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.dataSources.lists(), filters] as const,
    details: () => [...queryKeys.dataSources.all, 'detail'] as const,
    detail: (id: number) => 
      [...queryKeys.dataSources.details(), id] as const,
    rules: (id: number) => 
      [...queryKeys.dataSources.detail(id), 'rules'] as const,
  },
  dataImports: {
    all: ['dataImports'] as const,
    lists: () => [...queryKeys.dataImports.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.dataImports.lists(), filters] as const,
    detail: (id: number) => 
      [...queryKeys.dataImports.all, 'detail', id] as const,
    progress: (id: number) => 
      [...queryKeys.dataImports.detail(id), 'progress'] as const,
  },
  scrapingRules: {
    all: ['scrapingRules'] as const,
    lists: () => [...queryKeys.scrapingRules.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.scrapingRules.lists(), filters] as const,
    detail: (id: number) => 
      [...queryKeys.scrapingRules.all, 'detail', id] as const,
  },
  admin: {
    all: ['admin'] as const,
    users: {
      all: () => [...queryKeys.admin.all, 'users'] as const,
      list: (filters: Record<string, unknown>) => 
        [...queryKeys.admin.users.all(), 'list', filters] as const,
      stats: () => [...queryKeys.admin.users.all(), 'stats'] as const,
    },
    roles: {
      all: () => [...queryKeys.admin.all, 'roles'] as const,
      list: (filters: Record<string, unknown>) => 
        [...queryKeys.admin.roles.all(), 'list', filters] as const,
    },
    permissions: {
      all: () => [...queryKeys.admin.all, 'permissions'] as const,
      list: (filters: Record<string, unknown>) => 
        [...queryKeys.admin.permissions.all(), 'list', filters] as const,
    },
  },
  tasks: {
    all: ['tasks'] as const,
    list: () => [...queryKeys.tasks.all, 'list'] as const,
    executions: (id: number) => 
      [...queryKeys.tasks.all, 'executions', id] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
