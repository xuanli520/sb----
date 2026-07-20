import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { auditLoginApi, mapRawToLoginAuditLog } from '../services/auditLoginApi';
import { 
  PageMeta, 
  LoginAuditLogFilter, 
  RawLoginAuditLog,
} from '@/types';

const defaultMeta: PageMeta = {
  page: 1,
  size: 20,
  total: 0,
  pages: 0,
  has_next: false,
  has_prev: false,
};
const loginActions = ['login', 'logout', 'refresh', 'register'];

export interface LoginAuditFilters {
  search?: string;
  status?: 'all' | 'success' | 'failure';
  event_type?: string;
  account_type?: string;
  start_time?: string;
  end_time?: string;
}

export function useLoginAuditLogs(initialFilters?: LoginAuditLogFilter) {
  const pathname = usePathname();
  const [rawItems, setRawItems] = useState<RawLoginAuditLog[]>([]);
  const [meta, setMeta] = useState<PageMeta>(defaultMeta);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState({ success: 0, failure: 0 });
  const [filters, setFilters] = useState<LoginAuditLogFilter>(() => ({
    page: 1,
    size: 20,
    actions: loginActions.join(','),
    ...(initialFilters || {}),
  }));

  const requestIdRef = useRef(0);
  const statsRequestIdRef = useRef(0);

  const fetchData = useCallback(async (currentFilters: LoginAuditLogFilter) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await auditLoginApi.getAll(currentFilters);
      
      if (requestId === requestIdRef.current) {
        setRawItems(response.items || []);
        if (response.meta) {
          setMeta(response.meta);
        }
      }
      return response;
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err as Error);
      }
      console.error('Failed to fetch login audit logs:', err);
      throw err;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    fetchData(filters).catch(err => {
      if (!isCancelled) {
        console.error(err);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [pathname, filters, fetchData]);

  const items = useMemo(() => {
    return rawItems.map(mapRawToLoginAuditLog);
  }, [rawItems]);

  const fetchStats = useCallback(async (baseFilters: LoginAuditLogFilter) => {
    const requestId = ++statsRequestIdRef.current;
    try {
      const [successRes, failureRes] = await Promise.all([
        auditLoginApi.getAll({ ...baseFilters, result: 'success', page: 1, size: 1 }),
        auditLoginApi.getAll({ ...baseFilters, result: 'failure', page: 1, size: 1 }),
      ]);
      if (requestId === statsRequestIdRef.current) {
        setStats({
          success: successRes.meta?.total ?? 0,
          failure: failureRes.meta?.total ?? 0,
        });
      }
    } catch (err) {
      if (requestId === statsRequestIdRef.current) {
        setStats({ success: 0, failure: 0 });
      }
    }
  }, []);

  const buildServerFilters = useCallback((uiFilters: LoginAuditFilters): LoginAuditLogFilter => {
    const serverFilters: LoginAuditLogFilter = { 
      page: 1,
      size: filters.size,
    };
    
    if (uiFilters.event_type && uiFilters.event_type !== 'all') {
      serverFilters.action = uiFilters.event_type;
    } else {
      serverFilters.actions = loginActions.join(',');
    }

    if (uiFilters.status && uiFilters.status !== 'all') {
      serverFilters.result = uiFilters.status;
    }
    
    if (uiFilters.search) {
      serverFilters.ip = uiFilters.search;
    }

    if (uiFilters.account_type && uiFilters.account_type !== 'all') {
      serverFilters.account_type = uiFilters.account_type;
    }
    
    if (uiFilters.start_time) {
      serverFilters.occurred_from = uiFilters.start_time;
    }
    if (uiFilters.end_time) {
      serverFilters.occurred_to = uiFilters.end_time;
    }

    return serverFilters;
  }, [filters.size]);

  const updateFilters = useCallback((newFilters: Partial<LoginAuditLogFilter>) => {
    setFilters(prev => {
      const next = { ...prev, ...newFilters };
      if (next.page !== undefined) {
        next.page = Math.max(1, next.page);
      }
      return next;
    });
  }, []);

  const applyFilters = useCallback((uiFilters: LoginAuditFilters) => {
    const serverFilters = buildServerFilters(uiFilters);
    setFilters(serverFilters);
  }, [buildServerFilters]);

  useEffect(() => {
    if (filters.result) {
      setStats({ success: 0, failure: 0 });
      return;
    }
    const baseFilters: LoginAuditLogFilter = { ...filters };
    if (!baseFilters.action && !baseFilters.actions) {
      baseFilters.actions = loginActions.join(',');
    }
    delete baseFilters.result;
    fetchStats(baseFilters);
  }, [filters, fetchStats]);

  const refetch = useCallback(() => {
    return fetchData(filters);
  }, [fetchData, filters]);

  return {
    items,
    meta,
    loading,
    error,
    stats,
    filters,
    updateFilters,
    applyFilters,
    refetch,
  };
}
