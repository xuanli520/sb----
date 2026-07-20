'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { SecondaryPageLayout } from '@/app/components/layout/SecondaryPageLayout';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { DataSourceDetail } from '@/features/data-source/components/DataSourceDetail';
import { useDataSource } from '@/features/data-source/hooks/useDataSource';

export default function DataSourceDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { dataSource, loading, error, refresh } = useDataSource(id);

  if (loading) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '数据源管理', href: '/data-source' },
          { label: '详情' },
        ]}
        title="加载中..."
      >
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </SecondaryPageLayout>
    );
  }

  if (error) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '数据源管理', href: '/data-source' },
          { label: '详情' },
        ]}
        title="加载失败"
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">加载数据失败，请稍后重试</p>
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </CardContent>
        </Card>
      </SecondaryPageLayout>
    );
  }

  if (!dataSource) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '数据源管理', href: '/data-source' },
          { label: '详情' },
        ]}
        title="数据源详情"
      >
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            未找到数据源。
          </CardContent>
        </Card>
      </SecondaryPageLayout>
    );
  }

  return (
    <SecondaryPageLayout
      breadcrumbs={[
        { label: '数据源管理', href: '/data-source' },
        { label: dataSource.name || '详情' },
      ]}
      title={dataSource.name || '数据源详情'}
    >
      <div className="space-y-6">
        <DataSourceDetail dataSource={dataSource} onRefresh={refresh} />
      </div>
    </SecondaryPageLayout>
  );
}
