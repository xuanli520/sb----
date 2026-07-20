'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  EndpointDeprecatedData,
  EndpointInDevelopmentData,
  EndpointPlannedData,
  EndpointStatus,
  getEndpointStatus,
} from '@/types/endpoint';
import { ENDPOINT_CONFIG } from '@/config/endpoint-config';
import { buildStatusDescription } from '@/lib/endpoint-status/formatters';

interface ApiErrorState {
  status: EndpointStatus | null;
  message: string;
  data?: EndpointInDevelopmentData | EndpointPlannedData | EndpointDeprecatedData;
  isMock?: boolean;
  expectedRelease?: string;
  alternative?: string;
  removalDate?: string;
}

interface EndpointErrorResponse {
  code: number;
  msg: string;
  data?: unknown;
}

const STATUS_LABELS: Record<EndpointStatus, string> = {
  development: '开发中',
  planned: '计划中',
  deprecated: '已弃用',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isValidEndpointResponse(data: unknown): data is EndpointErrorResponse {
  if (!isRecord(data)) {
    return false;
  }
  return typeof data.code === 'number' && typeof data.msg === 'string';
}

export function useApiError() {
  const parseError = useCallback((error: unknown): ApiErrorState | null => {
    if (!isRecord(error)) {
      return null;
    }

    if (!isValidEndpointResponse(error.data)) {
      return null;
    }

    const status = getEndpointStatus(error.data.code);
    if (!status) {
      return null;
    }

    const statusData = isRecord(error.data.data) ? error.data.data : undefined;

    return {
      status,
      message: error.data.msg || '',
      data: statusData as ApiErrorState['data'],
      isMock: status === 'development' ? statusData?.mock === true : undefined,
      expectedRelease: typeof statusData?.expected_release === 'string'
        ? statusData.expected_release
        : undefined,
      alternative: status === 'deprecated' && typeof statusData?.alternative === 'string'
        ? statusData.alternative
        : undefined,
      removalDate: status === 'deprecated' && typeof statusData?.removal_date === 'string'
        ? statusData.removal_date
        : undefined,
    };
  }, []);

  const showErrorToast = useCallback((error: unknown) => {
    const errorState = parseError(error);
    if (!errorState?.status) {
      return false;
    }

    const description = buildStatusDescription(
      errorState.status,
      errorState.message,
      isRecord(errorState.data) ? errorState.data : undefined
    );

    toast(STATUS_LABELS[errorState.status], {
      description,
      duration: ENDPOINT_CONFIG.toastDuration,
      style: { maxWidth: 400 },
    });

    return true;
  }, [parseError]);

  const showDevModeToast = useCallback((message: string, isMock: boolean, expectedRelease?: string) => {
    const payload: Record<string, unknown> = {
      mock: isMock,
      expected_release: expectedRelease,
    };
    toast(STATUS_LABELS.development, {
      description: buildStatusDescription('development', message, payload),
      duration: ENDPOINT_CONFIG.toastDuration,
      style: { maxWidth: 400 },
    });
  }, []);

  const showPlannedToast = useCallback((message: string, expectedRelease?: string) => {
    const payload: Record<string, unknown> = {
      expected_release: expectedRelease,
    };
    toast(STATUS_LABELS.planned, {
      description: buildStatusDescription('planned', message, payload),
      duration: ENDPOINT_CONFIG.toastDuration,
      style: { maxWidth: 400 },
    });
  }, []);

  const showDeprecatedToast = useCallback((message: string, alternative?: string, removalDate?: string) => {
    const payload: Record<string, unknown> = {
      alternative,
      removal_date: removalDate,
    };
    toast(STATUS_LABELS.deprecated, {
      description: buildStatusDescription('deprecated', message, payload),
      duration: ENDPOINT_CONFIG.toastDuration,
      style: { maxWidth: 400 },
    });
  }, []);

  return {
    parseError,
    showErrorToast,
    showDevModeToast,
    showPlannedToast,
    showDeprecatedToast,
  };
}
