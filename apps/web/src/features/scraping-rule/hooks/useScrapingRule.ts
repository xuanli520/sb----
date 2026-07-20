import { useState, useEffect, useCallback, useRef } from 'react';
import { scrapingRuleApi } from '../services/scrapingRuleApi';
import { ScrapingRuleResponse } from '@/types';

export function useScrapingRule(id: number) {
  const [rule, setRule] = useState<ScrapingRuleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  const fetchRule = useCallback(async () => {
    if (!id || Number.isNaN(id)) {
      setRule(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await scrapingRuleApi.getById(id);
      if (requestId === requestIdRef.current) {
        setRule(data);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err as Error);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchRule();
  }, [fetchRule]);

  return { rule, loading, error, refresh: fetchRule };
}
