import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialRulesPanel } from './CommercialRulesPanel';

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

const initialRules = {
  membershipDaysMaximumPerCode: 36500,
  recommendationVotesPerDay: 10,
  monthlyVotesPerMonth: 5,
  rewardMinimumTokens: 1,
  rewardMaximumTokensPerReward: 1000000,
  rewardMaximumTokensPerDay: 5000000,
  updatedAt: '2026-07-21T08:00:00Z',
};

function mockCommercialRulesApi() {
  let rules = { ...initialRules };
  const audits = [{
    id: 17,
    previousRules: { ...initialRules, recommendationVotesPerDay: 8 },
    updatedRules: { ...initialRules },
    reason: '恢复常规推荐票额度',
    operatorUserId: 1,
    createdAt: '2026-07-21T08:00:00Z',
  }];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (path.endsWith('/admin/commercial-rules/audits?limit=20')) return Promise.resolve(response(audits));
    if (path.endsWith('/admin/commercial-rules') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response(rules));
    if (path.endsWith('/admin/commercial-rules') && init?.method === 'PUT') {
      const previousRules = rules;
      rules = {
        membershipDaysMaximumPerCode: Number(body.membershipDaysMaximumPerCode),
        recommendationVotesPerDay: Number(body.recommendationVotesPerDay),
        monthlyVotesPerMonth: Number(body.monthlyVotesPerMonth),
        rewardMinimumTokens: Number(body.rewardMinimumTokens),
        rewardMaximumTokensPerReward: Number(body.rewardMaximumTokensPerReward),
        rewardMaximumTokensPerDay: Number(body.rewardMaximumTokensPerDay),
        updatedAt: '2026-07-22T08:00:00Z',
      };
      audits.unshift({ id: 18, previousRules, updatedRules: rules, reason: String(body.reason), operatorUserId: 1, createdAt: rules.updatedAt });
      return Promise.resolve(response(rules));
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CommercialRulesPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.cookie = 'novel_csrf=commercial-rules-test';
  });

  it('loads the active policy and saves an audited cross-field-valid update', async () => {
    const fetchMock = mockCommercialRulesApi();
    render(<CommercialRulesPanel />);

    await screen.findByRole('heading', { name: '会员、票与打赏规则' });
    expect((screen.getByLabelText('每位读者每日推荐票') as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('每位读者每日推荐票'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('商业规则变更说明'), { target: { value: '周末活动期间增加推荐票' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/commercial-rules', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        membershipDaysMaximumPerCode: 36500,
        recommendationVotesPerDay: 12,
        monthlyVotesPerMonth: 5,
        rewardMinimumTokens: 1,
        rewardMaximumTokensPerReward: 1000000,
        rewardMaximumTokensPerDay: 5000000,
        reason: '周末活动期间增加推荐票',
      }),
    })));
    expect(await screen.findByText('商业规则已更新，变更已写入审计记录。')).toBeTruthy();
    expect((screen.getByLabelText('商业规则变更说明') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows immutable before-and-after snapshots in the operator audit dialog', async () => {
    const fetchMock = mockCommercialRulesApi();
    render(<CommercialRulesPanel />);

    await screen.findByRole('heading', { name: '会员、票与打赏规则' });
    fireEvent.click(screen.getByRole('button', { name: '查看商业规则审计' }));

    expect(await screen.findByRole('heading', { name: '商业规则审计' })).toBeTruthy();
    expect(screen.getByText('恢复常规推荐票额度')).toBeTruthy();
    expect(screen.getByText('推荐票/日：8 → 10')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/commercial-rules/audits?limit=20', expect.anything()));
  });
});
