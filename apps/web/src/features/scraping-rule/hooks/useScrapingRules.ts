import { useState, useEffect, useCallback, useRef } from 'react';
import { scrapingRuleApi, ScrapingRuleFilter } from '../services/scrapingRuleApi';
import { ScrapingRuleListItem, PageMeta } from '@/types';

interface PaginatedScrapingRuleResponse {
  items: ScrapingRuleListItem[];
  meta: PageMeta;
}

export function useScrapingRules(initialFilters?: ScrapingRuleFilter) {
  const [data, setData] = useState<PaginatedScrapingRuleResponse>({
    items: [],
    meta: {
      page: 1,
      size: 10,
      total: 0,
      pages: 0,
      has_next: false,
      has_prev: false,
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<ScrapingRuleFilter>(initialFilters || {
    page: 1,
    size: 10,
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (currentFilters: ScrapingRuleFilter) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await scrapingRuleApi.getAll(currentFilters);
      if (requestId === requestIdRef.current) {
        setData(response);
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
  }, []);

  useEffect(() => {
    fetchData(filters);
  }, [fetchData, filters]);

  const updateFilters = useCallback((newFilters: Partial<ScrapingRuleFilter>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const refresh = useCallback(() => {
    fetchData(filters);
  }, [fetchData, filters]);

  return {
    data,
    loading,
    error,
    filters,
    updateFilters,
    refresh,
  };
}
