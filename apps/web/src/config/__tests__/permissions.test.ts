import { describe, expect, it } from 'vitest';
import { matchRoutePermission } from '../permissions';
import { ROUTES } from '../routes';

describe('matchRoutePermission', () => {
  it('matches nested routes by the longest route prefix', () => {
    expect(matchRoutePermission('/data-center')?.route).toBe(ROUTES.DATA_CENTER);
    expect(matchRoutePermission('/data-source/12')?.route).toBe(ROUTES.DATA_SOURCE);
    expect(matchRoutePermission('/metric-detail')?.route).toBe(ROUTES.METRIC_DETAIL);
    expect(matchRoutePermission('/task-schedule/collection-jobs')?.route).toBe(ROUTES.TASK_SCHEDULE_COLLECTION_JOBS);
    expect(matchRoutePermission('/agent-workbench')?.route).toBe(ROUTES.AGENT_WORKBENCH);
    expect(matchRoutePermission('/scraping-rule/3/edit')?.route).toBe(ROUTES.SCRAPING_RULE);
  });
});
