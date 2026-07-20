import { useQuery } from '@tanstack/react-query';
import { shopDashboardApi } from '../services/shopDashboardApi';
import { ShopDashboardQueryRequest } from '../services/types';

export function useShopDashboardQuery(params: ShopDashboardQueryRequest) {
  return useQuery({
    queryKey: ['shop-dashboard', 'query', params],
    queryFn: () => shopDashboardApi.queryResults(params),
    enabled: Boolean(params.shop_id && params.start_date && params.end_date),
  });
}
