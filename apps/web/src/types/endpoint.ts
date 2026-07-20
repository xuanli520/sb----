export type EndpointStatus = 'development' | 'planned' | 'deprecated';

export interface EndpointInDevelopmentData {
  mock: boolean;
  expected_release?: string;
  data?: unknown;
}

export interface EndpointPlannedData {
  expected_release?: string;
}

export interface EndpointDeprecatedData {
  alternative?: string;
  removal_date?: string;
}

export interface EndpointStatusResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export const ENDPOINT_STATUS_CODES = {
  IN_DEVELOPMENT: 70001,
  PLANNED: 70002,
  DEPRECATED: 70003,
} as const;

export const ENDPOINT_STATUS_HTTP = {
  IN_DEVELOPMENT: 200,
  PLANNED: 501,
  DEPRECATED_STRICT: 410,
  DEPRECATED_SOFT: 200,
} as const;

export function isEndpointStatusCode(code: number): boolean {
  return Object.values(ENDPOINT_STATUS_CODES).includes(code as (typeof ENDPOINT_STATUS_CODES)[keyof typeof ENDPOINT_STATUS_CODES]);
}

export function getEndpointStatus(code: number): EndpointStatus | null {
  switch (code) {
    case ENDPOINT_STATUS_CODES.IN_DEVELOPMENT:
      return 'development';
    case ENDPOINT_STATUS_CODES.PLANNED:
      return 'planned';
    case ENDPOINT_STATUS_CODES.DEPRECATED:
      return 'deprecated';
    default:
      return null;
  }
}
