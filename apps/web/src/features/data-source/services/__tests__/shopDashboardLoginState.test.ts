import { describe, expect, it } from 'vitest';
import { buildDataSourceConfigSubmitPlan } from '../shopDashboardLoginState';

describe('buildDataSourceConfigSubmitPlan', () => {
  it('should detect raw storage_state json and build upload plan', () => {
    const storageState = {
      cookies: [
        {
          name: 'sid',
          value: 'abc',
          domain: '.example.com',
          path: '/',
        },
      ],
      origins: [],
    };

    const plan = buildDataSourceConfigSubmitPlan(
      storageState as any,
      'shop-1001' as any
    );

    expect(plan.nextConfig).toEqual({});
    expect(plan.upload).toEqual({
      accountId: 'shop-1001',
      storageState,
    });
  });

  it('should keep normal config passthrough when no login state exists', () => {
    const config = {
      shop_id: '1001',
      rate_limit: 100,
    };

    const plan = buildDataSourceConfigSubmitPlan(config as any);

    expect(plan.nextConfig).toEqual(config);
    expect(plan.upload).toBeUndefined();
  });
});
