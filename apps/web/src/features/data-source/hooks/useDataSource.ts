import { useState, useEffect, useCallback } from 'react';
import { dataSourceApi } from '../services/dataSourceApi';
import { DataSourceResponse } from '@/types';

export function useDataSource(id: number) {
  const [dataSource, setDataSource] = useState<DataSourceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDataSource = useCallback(async () => {
    if (!id || Number.isNaN(id)) {
      setDataSource(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await dataSourceApi.getById(id);
      setDataSource(data);
    } catch (err) {
      console.error('Failed to fetch data source:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDataSource();
  }, [fetchDataSource]);

  return { dataSource, loading, error, refresh: fetchDataSource };
}
