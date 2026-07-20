import { EndpointStatus } from '@/types/endpoint';

export interface EndpointMeta {
  status: EndpointStatus;
  expectedRelease?: string;
  alternative?: string;
  removalDate?: string;
  description?: string;
}

export const ENDPOINT_META: Record<string, EndpointMeta> = {
  '/api/v1/schedules': {
    status: 'development',
    expectedRelease: '2026-04-30',
    description: '调度能力开发中',
  },
  '/api/v1/schedules/:schedule_id': {
    status: 'development',
    expectedRelease: '2026-04-30',
    description: '调度详情与修改删除能力开发中',
  },
};

function normalizeEndpointPath(path: string): string {
  return path
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(
      /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(?=\/|$)/g,
      '/:id'
    );
}

function resolveDynamicMeta(path: string): EndpointMeta | undefined {
  if (ENDPOINT_META[path]) {
    return ENDPOINT_META[path];
  }

  const normalized = normalizeEndpointPath(path);

  for (const [key, value] of Object.entries(ENDPOINT_META)) {
    if (!key.includes(':')) {
      continue;
    }
    const keyPattern = key
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([A-Za-z_]\w*)/g, '[^/]+');
    const matcher = new RegExp(`^${keyPattern}$`);
    if (matcher.test(path) || matcher.test(normalized)) {
      return value;
    }
  }

  return undefined;
}

export function getEndpointMeta(path: string): EndpointMeta | undefined {
  return ENDPOINT_META[path] ?? resolveDynamicMeta(path);
}

export function isDevEndpoint(path: string): boolean {
  return getEndpointMeta(path)?.status === 'development';
}

export function isPlannedEndpoint(path: string): boolean {
  return getEndpointMeta(path)?.status === 'planned';
}

export function isDeprecatedEndpoint(path: string): boolean {
  return getEndpointMeta(path)?.status === 'deprecated';
}
