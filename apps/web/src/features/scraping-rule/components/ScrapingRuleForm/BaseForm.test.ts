import { describe, expect, it } from 'vitest';
import {
  buildRuleConfigFormDefaults,
  buildRuleConfigFromForm,
} from './BaseForm';
import type { ScrapingRuleConfig } from '@/types';

describe('scraping rule config form mapping', () => {
  it('maps all-shop config to structured form values and keeps advanced keys', () => {
    const defaults = buildRuleConfigFormDefaults({
      filters: { shop_id: ['all'], region: 'CN' },
      time_range: { start: '2026-03-01', end: '2026-03-08', mode: 'fixed' },
      rate_limit: { qps: 10, burst: 20 },
      agent_recipe: {
        namespace: 'douyin_shop_dashboard',
        key: 'experience_score_single_page',
        version: 2,
        stability: 'stable',
      },
      entrypoint: { url: 'https://example.test' },
    } as ScrapingRuleConfig);

    expect(defaults.shop_scope).toBe('all');
    expect(defaults.filters_extra).toEqual({ region: 'CN' });
    expect(defaults.time_range_extra).toEqual({ mode: 'fixed' });
    expect(defaults.rate_limit_extra).toEqual({ burst: 20 });
    expect(defaults.preserved_config).toEqual({ entrypoint: { url: 'https://example.test' } });

    const config = buildRuleConfigFromForm(defaults);

    expect(config.all).toBe(true);
    expect(config.filters).toMatchObject({ all: true, shop_id: ['all'], region: 'CN' });
    expect(config.time_range).toMatchObject({ start: '2026-03-01', end: '2026-03-08', mode: 'fixed' });
    expect(config.rate_limit).toEqual({ burst: 20, qps: 10 });
    expect(config.agent_recipe).toEqual({
      namespace: 'douyin_shop_dashboard',
      key: 'experience_score_single_page',
      version: 2,
    });
    expect(config.entrypoint).toEqual({ url: 'https://example.test' });
  });

  it('builds explicit multi-shop selection without JSON input', () => {
    const values = buildRuleConfigFormDefaults({
      filters: { shop_id: ['1001', '1002'] },
      agent_recipe: {
        namespace: 'douyin_shop_dashboard',
        key: 'experience_score_single_page',
        version: 1,
        stability: 'stable',
      },
    } as ScrapingRuleConfig);

    expect(values.shop_scope).toBe('multiple');

    const config = buildRuleConfigFromForm(values);

    expect(config.all).toBe(false);
    expect(config.shop_id).toBe('1001');
    expect(config.shop_ids).toEqual(['1001', '1002']);
    expect(config.filters).toMatchObject({ shop_id: ['1001', '1002'] });
  });

  it('requires recipe for all-shop collection', () => {
    const values = buildRuleConfigFormDefaults();

    expect(() => buildRuleConfigFromForm(values)).toThrow('全店/多店采集需要选择稳定 Agent Recipe');
  });

  it('allows single-shop collection without recipe', () => {
    const values = buildRuleConfigFormDefaults({
      filters: { shop_id: ['1001'] },
    } as ScrapingRuleConfig);

    expect(values.shop_scope).toBe('single');
    expect(values.single_shop_id).toBe('1001');
    expect(values.agent_recipe_enabled).toBe(false);

    const config = buildRuleConfigFromForm(values);

    expect(config.all).toBe(false);
    expect(config.shop_id).toBe('1001');
    expect(config.shop_ids).toEqual(['1001']);
    expect(config.agent_recipe).toBeNull();
  });

  it('requires an explicit shop for single-shop collection', () => {
    const values = {
      ...buildRuleConfigFormDefaults({
        filters: { shop_id: ['1001'] },
      } as ScrapingRuleConfig),
      single_shop_id: '',
    };

    expect(() => buildRuleConfigFromForm(values)).toThrow('请选择一个店铺');
  });

  it('requires at least one shop for multi-shop collection', () => {
    const values = {
      ...buildRuleConfigFormDefaults({
        filters: { shop_id: ['1001', '1002'] },
        agent_recipe: {
          namespace: 'douyin_shop_dashboard',
          key: 'experience_score_single_page',
          version: 1,
          stability: 'stable',
        },
      } as ScrapingRuleConfig),
      shop_ids: [],
    };

    expect(() => buildRuleConfigFromForm(values)).toThrow('请选择至少一个店铺');
  });

  it('rejects non-stable recipe for multi-shop collection', () => {
    const values = buildRuleConfigFormDefaults({
      filters: { shop_id: ['1001', '1002'] },
      agent_recipe: {
        namespace: 'douyin_shop_dashboard',
        key: 'experience_score_single_page',
        version: 1,
        stability: 'candidate',
      },
    } as ScrapingRuleConfig);

    expect(() => buildRuleConfigFromForm(values)).toThrow('全店/多店采集只能使用 stable Agent Recipe');
  });

  it('rejects unavailable recipe selection', () => {
    const values = {
      ...buildRuleConfigFormDefaults({
        filters: { shop_id: ['1001'] },
        agent_recipe: {
          namespace: 'douyin_shop_dashboard',
          key: 'experience_score_single_page',
          version: 1,
        },
      } as ScrapingRuleConfig),
      agent_recipe_stability: 'unavailable',
    };

    expect(() => buildRuleConfigFromForm(values)).toThrow('当前 Agent Recipe 不可用，请重新选择');
  });

  it('rejects enabled recipe without explicit version', () => {
    const values = {
      ...buildRuleConfigFormDefaults({
        filters: { shop_id: ['1001'] },
        agent_recipe: {
          namespace: 'douyin_shop_dashboard',
          key: 'experience_score_single_page',
        },
      } as ScrapingRuleConfig),
      agent_recipe_enabled: true,
      agent_recipe_version: '',
      agent_recipe_stability: 'stable',
    };

    expect(() => buildRuleConfigFromForm(values)).toThrow('请选择带版本的 Agent Recipe');
  });

  it('emits clear values for editable optional config fields', () => {
    const values = {
      ...buildRuleConfigFormDefaults({
        filters: { shop_id: ['1001'] },
        time_range: { start: '2026-03-01' },
        rate_limit: { qps: 10 },
        dimensions: ['date'],
        metrics: ['gmv'],
        dedupe_key: 'order_id',
        top_n: 100,
        sort_by: 'gmv',
        agent_recipe: {
          namespace: 'douyin_shop_dashboard',
          key: 'experience_score_single_page',
          version: 1,
        },
      } as ScrapingRuleConfig),
      time_range_enabled: false,
      time_range_start: '',
      time_range_end: '',
      dimensions_text: '',
      metrics_text: '',
      dedupe_key: '',
      rate_limit_enabled: false,
      rate_limit_qps: '',
      top_n: '',
      sort_by: '',
      agent_recipe_enabled: false,
    };

    const config = buildRuleConfigFromForm(values);

    expect(config.time_range).toBeNull();
    expect(config.rate_limit).toBeNull();
    expect(config.dimensions).toEqual([]);
    expect(config.metrics).toEqual([]);
    expect(config.dedupe_key).toBeNull();
    expect(config.top_n).toBeNull();
    expect(config.sort_by).toBeNull();
    expect(config.agent_recipe).toBeNull();
  });
});
