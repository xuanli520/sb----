import { useState } from 'react';
import { dataSourceApi } from '../services/dataSourceApi';
import { DataSourceResponse } from '@/types';

export function useActivateDataSource() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const setActive = async (id: number, active: boolean): Promise<DataSourceResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = active
        ? await dataSourceApi.activate(id)
        : await dataSourceApi.deactivate(id);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { activate: setActive, loading, error };
}
