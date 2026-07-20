import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataSourceApi, DataSourceFilter } from '../services/dataSourceApi';
import { DataSourceResponse, PageMeta } from '@/types';
import { queryKeys } from '@/lib/query/keys';
import { normalizeDataSourceFilter } from '../services/dataSourceService';

interface PaginatedDataSourceResponse {
  items: DataSourceResponse[];
  meta: PageMeta;
}

function normalizeFilters(filters?: DataSourceFilter): DataSourceFilter {
  return normalizeDataSourceFilter(filters);
}

function isSameFilter(a: DataSourceFilter, b: DataSourceFilter): boolean {
  return (
    a.page === b.page
    && a.size === b.size
    && a.name === b.name
    && a.status === b.status
    && a.source_type === b.source_type
  );
}

export function useDataSources(initialFilters?: DataSourceFilter) {
  const [filters, setFilters] = useState<DataSourceFilter>(() => normalizeFilters(initialFilters));

  useEffect(() => {
    if (!initialFilters) {
      return;
    }
    const next = normalizeFilters(initialFilters);
    setFilters(prev => (isSameFilter(prev, next) ? prev : next));
  }, [initialFilters]);

  const query = useQuery({
    queryKey: queryKeys.dataSources.list(filters as Record<string, unknown>),
    queryFn: () => dataSourceApi.getAll(filters),
  });

  const updateFilters = useCallback((newFilters: Partial<DataSourceFilter>) => {
    setFilters(prev => {
      const next = { ...prev, ...newFilters };
      const changed = Object.keys(next).some(
        key => prev[key as keyof DataSourceFilter] !== next[key as keyof DataSourceFilter],
      );
      return changed ? next : prev;
    });
  }, []);

  const refetch = useCallback(() => {
    return query.refetch();
  }, [query]);

  const data: PaginatedDataSourceResponse = query.data ?? {
    items: [],
    meta: {
      page: filters.page ?? 1,
      size: filters.size ?? 10,
      total: 0,
      pages: 0,
      has_next: false,
      has_prev: false,
    },
  };

  const error = query.error instanceof Error ? query.error : null;

  return {
    data,
    loading: query.isLoading || query.isFetching,
    error,
    filters,
    updateFilters,
    refetch,
  };
}
