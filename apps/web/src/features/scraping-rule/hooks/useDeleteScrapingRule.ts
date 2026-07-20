import { useState } from 'react';
import { scrapingRuleApi } from '../services/scrapingRuleApi';

export function useDeleteScrapingRule() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const remove = async (id: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await scrapingRuleApi.delete(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { remove, loading, error };
}
