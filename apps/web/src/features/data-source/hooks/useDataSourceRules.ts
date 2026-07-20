import { useState, useEffect, useCallback } from 'react';
import { dataSourceApi } from '../services/dataSourceApi';
import { ScrapingRuleListItem } from '@/types';

export function useDataSourceRules(dataSourceId: number) {
  const [rules, setRules] = useState<ScrapingRuleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRules = useCallback(async () => {
    if (!dataSourceId) return;

    setLoading(true);
    setError(null);
    try {
      const data = await dataSourceApi.getScrapingRules(dataSourceId);
      setRules(data);
    } catch (err) {
      console.error('Failed to fetch data source rules:', err);
      setError(err as Error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [dataSourceId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return { rules, loading, error, refresh: fetchRules };
}
