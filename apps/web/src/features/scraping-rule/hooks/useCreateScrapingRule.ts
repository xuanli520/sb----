import { useState } from 'react';
import { scrapingRuleApi } from '../services/scrapingRuleApi';
import { ScrapingRuleCreate, ScrapingRuleResponse } from '@/types';

export function useCreateScrapingRule() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = async (data: ScrapingRuleCreate): Promise<ScrapingRuleResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await scrapingRuleApi.create(data);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { create, loading, error };
}
