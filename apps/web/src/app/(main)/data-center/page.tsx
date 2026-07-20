'use client';

import React, { useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { MetricsGrid, SummaryBar } from '@/components/data-center/MetricsGrid';
import { ChartsSection } from '@/components/data-center/ChartsSection';
import { dataCenterService } from '@/services/dataCenterService';
import { DataCenterResponse } from '@/types/data-center';

type TimeFilter = 'today' | 'week' | 'month';

const TIME_FILTERS: Array<{ id: TimeFilter; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'week', label: '本周' },
  { id: 'month', label: '本月' },
];

const EMPTY_DATA: DataCenterResponse = {
  updateTime: '暂无数据',
  metrics: {
    comprehensiveScore: { title: '综合评分', value: 0, change: 0, trend: [] },
    productExperience: { title: '商品体验分', value: 0, change: 0, trend: [] },
    logisticsExperience: { title: '物流体验分', value: 0, change: 0, trend: [] },
    serviceExperience: { title: '服务体验分', value: 0, change: 0, trend: [] },
    negativeReviewRisk: { title: '差评风险', value: 0, change: 0, trend: [] },
  },
  summary: {
    monitoredShops: 0,
    dataCoverage: 0,
  },
  charts: {
    trend: [],
    radar: [
      { subject: '商品体验分', score: 0, fullMark: 100 },
      { subject: '物流体验分', score: 0, fullMark: 100 },
      { subject: '服务体验分', score: 0, fullMark: 100 },
      { subject: '差评风险', score: 0, fullMark: 100 },
    ],
    rank: [],
    scoreDistribution: [],
    problemDistribution: [],
  },
};

export default function DataCenterPage() {
  const { appTheme } = useThemeStore();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [data, setData] = useState<DataCenterResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');

    dataCenterService.getDashboardData(timeFilter)
      .then((response) => {
        if (!cancelled) {
          setData(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(EMPTY_DATA);
          setErrorMessage('当前无法获取店铺评分数据，请稍后刷新或检查后端服务状态。');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeFilter]);
  
  // Theme styling helpers
  const isEnterprise = appTheme === 'enterprise';
  const pageBg = isEnterprise ? 'bg-[#f0f9ff]/50 dark:bg-[#0b1220]/60' : 'bg-white/60 dark:bg-transparent';
  const textColor = isEnterprise ? 'text-[#1e3a5a] dark:text-slate-100' : 'text-slate-900 dark:text-[#C8FDE6]';
  const iconColor = isEnterprise ? 'text-[#0284c7] dark:text-[#38bdf8]' : 'text-[#0284c7] dark:text-[#C8FDE6]';
  const secondaryTextColor = isEnterprise ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400';
  const filterShellClass = isEnterprise
    ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/80'
    : 'border-slate-200 bg-white/80 dark:border-white/10 dark:bg-slate-900/70';
  const filterDividerClass = isEnterprise ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-white/10';

  return (
    <div className={`flex h-full flex-col gap-6 ${pageBg}`}>
      {/* 1. Page Header (Top Action Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LayoutDashboard className={`w-8 h-8 ${iconColor}`} />
          <h1 className={`text-2xl font-bold ${textColor}`}>数据中控台</h1>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {/* Time Filter */}
          <div className="flex items-center gap-2">
            <span className={`text-sm ${secondaryTextColor}`}>时间筛选:</span>
            <div className={`flex overflow-hidden rounded-md border ${filterShellClass}`}>
              {TIME_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setTimeFilter(filter.id)}
                  className={`px-4 py-1.5 text-sm transition-colors ${
                    timeFilter === filter.id
                      ? (isEnterprise ? 'bg-[#0284c7]/10 text-[#0284c7] dark:bg-[#0ea5e9]/20 dark:text-[#38bdf8] font-medium' : 'bg-[#0284c7]/10 text-[#0284c7] dark:bg-[#C8FDE6]/20 dark:text-[#C8FDE6]')
                      : (isEnterprise ? 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5')
                  } ${filter.id !== 'today' ? `border-l ${filterDividerClass}` : ''}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Update Time */}
          <div className={`flex items-center gap-1.5 text-sm lg:ml-4 ${secondaryTextColor}`}>
            {isEnterprise ? (
              <>
                <span className="text-lg">↻</span>
                <span>数据更新时间: {data.updateTime}</span>
              </>
            ) : (
              <>
                <span>数据更新时间: {data.updateTime}</span>
                <span className="text-[#C8FDE6] text-lg ml-1">↻</span>
              </>
            )}
          </div>
        </div>
      </div>

      {(isLoading || errorMessage || data.summary.monitoredShops === 0) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          errorMessage
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
            : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
        }`}>
          {isLoading
            ? '正在读取店铺评分数据...'
            : errorMessage || '当前时间范围暂无店铺评分数据。请先在任务调度中完成采集，或切换到更长的时间范围查看历史结果。'}
        </div>
      )}

      {/* 2. Core Metrics Grid */}
      <MetricsGrid metrics={data.metrics} />

      {/* 3. Summary Bar */}
      <SummaryBar summary={data.summary} />

      {/* 4. Charts Section */}
      <ChartsSection charts={data.charts} />
    </div>
  );
}
