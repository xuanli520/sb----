import React, { useState } from 'react';
import { DataSource } from '../../services/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { StatusTag } from '../common/StatusTag';
import { TypeTag } from '../common/TypeTag';
import { Button } from '@/app/components/ui/button';
import { Power, PowerOff, Activity, Trash2 } from 'lucide-react';
import { useActivateDataSource } from '../../hooks/useActivateDataSource';
import { useValidateDataSource } from '../../hooks/useValidateDataSource';
import { dataSourceApi } from '../../services/dataSourceApi';
import { toast } from 'sonner';

interface InfoCardProps {
  dataSource: DataSource;
  onRefresh?: () => Promise<void> | void;
}

export function InfoCard({ dataSource: initialDataSource, onRefresh }: InfoCardProps) {
  const [dataSource, setDataSource] = useState<DataSource>(initialDataSource);
  const [clearingLoginState, setClearingLoginState] = useState(false);
  const { activate, loading: activating } = useActivateDataSource();
  const { validate, validating, validationResult } = useValidateDataSource();

  const isActive = dataSource.status === 'ACTIVE';
  const meta = dataSource.config.shop_dashboard_login_state_meta;
  const hasLoginStateMeta = Boolean(
    meta?.account_id || meta?.updated_at || meta?.state_version || typeof meta?.cookie_count === 'number'
  );

  const handleToggleActive = async () => {
    try {
      await activate(dataSource.id, !isActive);
      setDataSource(prev => ({ ...prev, status: isActive ? 'INACTIVE' : 'ACTIVE' }));
      toast.success(isActive ? '数据源已停用' : '数据源已启用');
      await onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const handleValidate = async () => {
    await validate(dataSource.id);
  };

  const handleClearLoginState = async () => {
    setClearingLoginState(true);
    try {
      await dataSourceApi.clearShopDashboardLoginState(dataSource.id);
      setDataSource(prev => ({
        ...prev,
        config: {
          ...prev.config,
          shop_dashboard_login_state_meta: undefined,
        },
      }));
      toast.success('登录态已清空');
      await onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空登录态失败');
    } finally {
      setClearingLoginState(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-4">
          <TypeTag type={dataSource.type} />
          <div>
            <CardTitle className="text-xl font-bold">{dataSource.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{dataSource.description || '暂无描述'}</p>
          </div>
        </div>
        <StatusTag status={dataSource.status} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <h4 className="text-sm font-medium mb-1 text-muted-foreground">创建时间</h4>
            <p className="font-mono">{new Date(dataSource.created_at).toLocaleString()}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1 text-muted-foreground">更新时间</h4>
            <p className="font-mono">{new Date(dataSource.updated_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearLoginState}
            disabled={clearingLoginState || !hasLoginStateMeta}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {clearingLoginState ? '清空中...' : '清空登录态'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
            <Activity className={`w-4 h-4 mr-2 ${validating ? 'animate-spin' : ''}`} />
            {validating ? '验证中...' : '测试连接'}
          </Button>
          <Button
            variant={isActive ? 'destructive' : 'default'}
            size="sm"
            onClick={handleToggleActive}
            disabled={activating}
          >
            {isActive ? (
              <>
                <PowerOff className="w-4 h-4 mr-2" />
                停用
              </>
            ) : (
              <>
                <Power className="w-4 h-4 mr-2" />
                启用
              </>
            )}
          </Button>
        </div>

        {validationResult && (
          <div className={`mt-4 rounded p-3 text-sm ${validationResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
            {validationResult.success ? '连接成功' : `连接失败: ${validationResult.message}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
