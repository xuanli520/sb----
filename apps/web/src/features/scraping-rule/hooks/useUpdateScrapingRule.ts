import { useState } from 'react';
import { scrapingRuleApi } from '../services/scrapingRuleApi';
import { ScrapingRuleUpdate, ScrapingRuleResponse } from '@/types';

export function useUpdateScrapingRule() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const update = async (id: number, data: ScrapingRuleUpdate): Promise<ScrapingRuleResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await scrapingRuleApi.update(id, data);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { update, loading, error };
}
