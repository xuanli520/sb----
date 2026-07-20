import { DataSourceConfig } from '@/types';

interface ShopDashboardUploadPlan {
  accountId: string;
  storageState: Record<string, unknown>;
}

export interface DataSourceConfigSubmitPlan {
  nextConfig: DataSourceConfig;
  upload?: ShopDashboardUploadPlan;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isStorageStateObject(value: Record<string, unknown>): boolean {
  return Array.isArray(value.cookies) && Array.isArray(value.origins);
}

function extractStorageState(loginStateObj: Record<string, unknown>): Record<string, unknown> | null {
  const nestedStorageState = asObject(loginStateObj.storage_state);
  if (nestedStorageState && isStorageStateObject(nestedStorageState)) {
    return nestedStorageState;
  }

  if (isStorageStateObject(loginStateObj)) {
    return loginStateObj;
  }

  return null;
}

function pickAccountId(
  configObj: Record<string, unknown>,
  loginStateObj: Record<string, unknown> | null,
  fallbackAccountId?: string
): string {
  const metaObj = asObject(configObj.shop_dashboard_login_state_meta);
  const credentialsObj = asObject(loginStateObj?.credentials);

  const accountId = (
    metaObj?.account_id
    || loginStateObj?.account_id
    || credentialsObj?.account_id
    || configObj.account_id
    || fallbackAccountId
  );

  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('上传登录态必须提供 account_id');
  }

  return accountId.trim();
}

export function buildDataSourceConfigSubmitPlan(
  config: DataSourceConfig,
  fallbackAccountId?: string
): DataSourceConfigSubmitPlan {
  const configObj = asObject(config);
  if (!configObj) {
    return { nextConfig: config };
  }

  if ('shop_dashboard_login_state' in configObj) {
    const rawLoginState = configObj.shop_dashboard_login_state;
    const nextConfig: DataSourceConfig = { ...configObj };
    delete nextConfig.shop_dashboard_login_state;
    delete nextConfig.shop_dashboard_login_state_meta;

    if (rawLoginState === null || rawLoginState === undefined) {
      return { nextConfig };
    }

    const loginStateObj = asObject(rawLoginState);
    if (!loginStateObj) {
      throw new Error('shop_dashboard_login_state 必须是 JSON 对象');
    }

    const storageState = extractStorageState(loginStateObj);
    if (!storageState) {
      throw new Error('shop_dashboard_login_state 中缺少有效的 storage_state（需包含 cookies 和 origins 数组）');
    }

    return {
      nextConfig,
      upload: {
        accountId: pickAccountId(configObj, loginStateObj, fallbackAccountId),
        storageState,
      },
    };
  }

  const rootStorageStateWrapper = asObject(configObj.storage_state);
  if (rootStorageStateWrapper && isStorageStateObject(rootStorageStateWrapper)) {
    const nextConfig: DataSourceConfig = { ...configObj };
    delete (nextConfig as Record<string, unknown>).storage_state;
    delete (nextConfig as Record<string, unknown>).account_id;
    delete (nextConfig as Record<string, unknown>).shop_dashboard_login_state_meta;

    return {
      nextConfig,
      upload: {
        accountId: pickAccountId(configObj, configObj, fallbackAccountId),
        storageState: rootStorageStateWrapper,
      },
    };
  }

  if (isStorageStateObject(configObj)) {
    return {
      nextConfig: {},
      upload: {
        accountId: pickAccountId(configObj, configObj, fallbackAccountId),
        storageState: configObj,
      },
    };
  }

  return { nextConfig: config };
}
