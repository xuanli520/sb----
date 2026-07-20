import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { ShopDashboardLoginStateMeta } from '@/types';

interface LoginStateMetaCardProps {
  meta?: ShopDashboardLoginStateMeta;
}

export function LoginStateMetaCard({ meta }: LoginStateMetaCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>登录态元数据</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Cookie 数量</h4>
            <p className="font-mono">{meta?.cookie_count ?? '-'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">账号 ID</h4>
            <p className="font-mono break-all">{meta?.account_id || '-'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">更新时间</h4>
            <p className="font-mono">{meta?.updated_at ? new Date(meta.updated_at).toLocaleString() : '-'}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">状态版本</h4>
            <p className="font-mono">{meta?.state_version || '-'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
