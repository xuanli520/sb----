'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { SecondaryPageLayout } from '@/app/components/layout/SecondaryPageLayout';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ScrapingRuleDetail } from '@/features/scraping-rule/components/ScrapingRuleDetail';
import { useScrapingRule } from '@/features/scraping-rule/hooks/useScrapingRule';

export default function ScrapingRuleDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { rule, loading, error, refresh } = useScrapingRule(id);

  if (loading) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '采集规则', href: '/scraping-rule' },
          { label: '详情' },
        ]}
        title="加载中..."
      >
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          </CardContent>
        </Card>
      </SecondaryPageLayout>
    );
  }

  if (error) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '采集规则', href: '/scraping-rule' },
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

  if (!rule) {
    return (
      <SecondaryPageLayout
        breadcrumbs={[
          { label: '采集规则', href: '/scraping-rule' },
          { label: '详情' },
        ]}
        title="采集规则详情"
      >
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            未找到规则。
          </CardContent>
        </Card>
      </SecondaryPageLayout>
    );
  }

  return (
    <SecondaryPageLayout
      breadcrumbs={[
        { label: '采集规则', href: '/scraping-rule' },
        { label: rule.name || '详情' },
      ]}
      title={rule.name || '采集规则详情'}
    >
      <ScrapingRuleDetail rule={rule} />
    </SecondaryPageLayout>
  );
}
