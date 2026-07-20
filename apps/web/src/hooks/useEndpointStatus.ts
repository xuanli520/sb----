'use client';

import { useMemo } from 'react';
import { getEndpointMeta } from '@/config/endpoint-meta';
import {
  EndpointDeprecatedData,
  EndpointInDevelopmentData,
  EndpointPlannedData,
  EndpointStatus,
  getEndpointStatus,
} from '@/types/endpoint';

interface UseEndpointStatusOptions {
  path: string;
  responseData?: {
    code?: number;
    data?: EndpointInDevelopmentData | EndpointPlannedData | EndpointDeprecatedData | Record<string, unknown>;
  } | null;
  returnDefaultOnUnknown?: boolean;
}

export interface UseEndpointStatusReturn {
  status: EndpointStatus | null;
  isMock?: boolean;
  expectedRelease?: string;
  alternative?: string;
  removalDate?: string;
  description?: string;
  isLoading: boolean;
  isDevelopment: boolean;
  isPlanned: boolean;
  isDeprecated: boolean;
  isActive: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function useEndpointStatus(options: UseEndpointStatusOptions): UseEndpointStatusReturn {
  const { path, responseData, returnDefaultOnUnknown = false } = options;

  const meta = useMemo(() => getEndpointMeta(path), [path]);

  return useMemo<UseEndpointStatusReturn>(() => {
    const statusFromResponse = typeof responseData?.code === 'number'
      ? getEndpointStatus(responseData.code)
      : null;

    const data = isRecord(responseData?.data) ? responseData.data : undefined;

    if (!meta && !statusFromResponse && !returnDefaultOnUnknown) {
      return {
        status: null,
        isLoading: false,
        isDevelopment: false,
        isPlanned: false,
        isDeprecated: false,
        isActive: true,
      };
    }

    const status = statusFromResponse ?? meta?.status ?? null;
    const expectedRelease = typeof data?.expected_release === 'string'
      ? data.expected_release
      : meta?.expectedRelease;
    const alternative = typeof data?.alternative === 'string'
      ? data.alternative
      : meta?.alternative;
    const removalDate = typeof data?.removal_date === 'string'
      ? data.removal_date
      : meta?.removalDate;
    const isMock = status === 'development'
      ? data?.mock === true
      : undefined;

    return {
      status,
      isMock,
      expectedRelease,
      alternative,
      removalDate,
      description: typeof data?.description === 'string'
        ? data.description
        : meta?.description,
      isLoading: false,
      isDevelopment: status === 'development',
      isPlanned: status === 'planned',
      isDeprecated: status === 'deprecated',
      isActive: status === null,
    };
  }, [meta, responseData, returnDefaultOnUnknown]);
}
