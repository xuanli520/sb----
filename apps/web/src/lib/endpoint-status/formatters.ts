import { EndpointStatus } from '@/types/endpoint';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function buildStatusDescription(
  status: EndpointStatus,
  message: string,
  data?: Record<string, unknown>
): string {
  switch (status) {
    case 'development': {
      const mockLabel = data?.mock === true ? '（演示数据）' : '';
      const expectedRelease = readString(data?.expected_release);
      const release = expectedRelease ? `，预计 ${expectedRelease} 发布` : '';
      return `${message}${mockLabel}${release}`;
    }
    case 'planned': {
      const expectedRelease = readString(data?.expected_release);
      const release = expectedRelease ? `，预计 ${expectedRelease} 推出` : '';
      return `${message}${release}`;
    }
    case 'deprecated': {
      const alternative = readString(data?.alternative);
      const removalDate = readString(data?.removal_date);
      let description = message;
      if (alternative) {
        description += `，请使用: ${alternative}`;
      }
      if (removalDate) {
        description += `，将于 ${removalDate} 移除`;
      }
      return description;
    }
  }
}
