'use client';

import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useThemeStore } from '@/stores/themeStore';
import { HelpCircle, AlertTriangle, Store, Package, Truck, HeadphonesIcon, ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { CoreMetrics, DataCenterSummary, MetricData } from '@/types/data-center';

interface MetricCardProps {
  title: string;
  value: string | number;
  suffix?: string;
  description: string;
  change: number;
  icon?: React.ElementType;
  data: MetricData['trend'];
  isWarning?: boolean;
  isPrimary?: boolean;
}

export function MetricCard({ title, value, suffix = '', description, change, icon: Icon, data, isWarning, isPrimary }: MetricCardProps) {
  const { appTheme } = useThemeStore();
  const isEnterprise = appTheme === 'enterprise';
  const chartGradientId = React.useId().replace(/:/g, '');

  const isPositive = change >= 0;
  // up triangle for positive, down for negative
  const changeSymbol = isPositive ? '↑' : '↓';
  const changeArrow = isPositive ? '▲' : '▼';
  
  // Logic for color:
  // Normal metrics: Up is Good (Green/Blue depending on theme?), Down is Bad (Red)
  // Actually looking at mockups:
  // Enterprise: Up is Blue (`↑ 0.8`), Down is Red (`↓ 0.3`)
  // Cyberpunk: Up is Green (`+0.5 ▲`), Down is Red (`-0.3 ▼`)
  // For Warning (差评风险):
  // Cyberpunk mockup shows `-0.4% ▼` in Green (down is good).
  // Enterprise mockup shows `↓ 0.3%` in Red (wait, down is red even though it's good? That might be a mistake in the mockup, let's use logic: down is good).
  
  let changeColor = '';
  if (isWarning) {
    changeColor = isPositive ? 'text-red-500' : 'text-emerald-500';
  } else {
    if (isEnterprise) {
      changeColor = isPositive ? 'text-blue-500' : 'text-red-500';
    } else {
      changeColor = isPositive ? 'text-emerald-500' : 'text-red-500';
    }
  }
  const changeTextClass = `${changeColor} dark:text-white`;
  const changeLabelClass = 'text-slate-500 dark:text-white';

  // Theme colors
  const bgClass = isEnterprise
    ? 'bg-white dark:bg-[var(--card)] border-slate-100 dark:border-[var(--border)] shadow-sm dark:shadow-[0_20px_45px_-24px_rgba(0,0,0,0.85)]'
    : 'bg-white/90 dark:bg-[#0a101f]/80 border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none';
  const titleClass = isEnterprise ? 'text-slate-600 dark:text-slate-300' : 'text-slate-700 dark:text-slate-300';
  const valueClass = isPrimary 
    ? (isEnterprise ? 'text-[#2563eb] dark:text-[#38bdf8]' : 'text-slate-900 dark:text-white') 
    : (isWarning ? 'text-red-500 dark:text-red-400' : (isEnterprise ? 'text-[#2563eb] dark:text-[#38bdf8]' : 'text-slate-900 dark:text-white'));
  
  const chartColor = isEnterprise ? '#3b82f6' : '#0ea5e9'; // Blue for enterprise, Cyan for cyber
  const warningChartColor = '#ef4444'; // Red for warnings
  const strokeColor = isWarning ? warningChartColor : chartColor;
  const gradientStartOpacity = isWarning ? 0.32 : (isEnterprise ? 0.2 : 0.4);
  const gradientEndOpacity = isWarning ? 0.12 : 0;

  return (
    <div className={`rounded-xl border p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-md ${bgClass} ${isPrimary ? (isEnterprise ? 'sm:col-span-2 lg:col-span-3 2xl:col-span-2 2xl:row-span-2 border-blue-100 bg-blue-50/30 dark:border-[#0ea5e9]/30 dark:bg-[#0f172a]/90' : 'sm:col-span-2 lg:col-span-3 2xl:col-span-2 2xl:row-span-2 bg-gradient-to-b from-white/90 to-[#0ea5e9]/10 dark:from-[#0a101f]/80 dark:to-[#0ea5e9]/10 border-[#0ea5e9]/30') : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-sm ${titleClass}`}>
          <span>{title}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3.5 h-3.5 opacity-60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 leading-relaxed">
              {description}
            </TooltipContent>
          </Tooltip>
        </div>
        {Icon && (
          <div className={`p-1.5 rounded-full ${isWarning ? (isEnterprise ? 'bg-red-50 text-red-500' : 'bg-red-500/10 text-red-400') : (isEnterprise ? 'bg-blue-50 text-blue-500' : 'text-[#0ea5e9]')}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Main Value */}
      <div className={`flex flex-col flex-1 justify-center ${isPrimary ? 'items-center mt-4' : 'items-start mt-2'}`}>
        <div className="flex items-baseline gap-1 z-10">
          <span className={`${isPrimary ? 'text-5xl sm:text-6xl tracking-tight' : 'text-3xl sm:text-4xl'} font-bold ${valueClass}`}>
            {value}
          </span>
          {suffix && <span className={`${isPrimary ? 'text-2xl' : 'text-xl'} ${valueClass}`}>{suffix}</span>}
        </div>
        
        {/* Primary specific pedestal glow (mocked with CSS) */}
        {isPrimary && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-20 bg-blue-500/20 dark:bg-sky-500/15 blur-2xl rounded-full pointer-events-none" />
        )}
      </div>

      {/* Change Indicator */}
      <div className={`flex items-center gap-2 text-sm z-10 mt-4 ${isPrimary ? 'justify-center' : 'justify-start'}`}>
        <span className={changeLabelClass}>{isEnterprise ? '' : '较昨日'}</span>
        <span className="flex items-center gap-1 font-medium">
          {isEnterprise ? (
            <>
              <span className={changeColor}>{changeSymbol}</span>
              <span className={changeTextClass}>{Math.abs(change)} 较昨日</span>
            </>
          ) : (
            <>
              <span className={changeTextClass}>{change > 0 ? '+' : '-'}{Math.abs(change)}{suffix && suffix !== '分' ? suffix : ''}</span>
              <span className={changeColor}>{changeArrow}</span>
            </>
          )}
        </span>
      </div>

      {/* Mini Sparkline Chart */}
      {!isPrimary && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-80 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`metric-area-${chartGradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={gradientStartOpacity} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={gradientEndOpacity} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#metric-area-${chartGradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function MetricsGrid({ metrics }: { metrics: CoreMetrics }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <MetricCard
        title="综合评分 (店铺平均分)"
        value={metrics.comprehensiveScore.value}
        description="当前范围内所有监控店铺综合体验分的平均值。"
        change={metrics.comprehensiveScore.change}
        data={metrics.comprehensiveScore.trend}
        isPrimary
      />
      <MetricCard
        title="商品体验分"
        value={metrics.productExperience.value}
        description="衡量商品质量、描述一致性和商品相关售后反馈的体验分。"
        change={metrics.productExperience.change}
        icon={Package}
        data={metrics.productExperience.trend}
      />
      <MetricCard
        title="物流体验分"
        value={metrics.logisticsExperience.value}
        description="衡量发货、配送时效和物流服务稳定性的体验分。"
        change={metrics.logisticsExperience.change}
        icon={Truck}
        data={metrics.logisticsExperience.trend}
      />
      <MetricCard
        title="服务体验分"
        value={metrics.serviceExperience.value}
        description="衡量客服响应、售后处理和服务满意度的体验分。"
        change={metrics.serviceExperience.change}
        icon={HeadphonesIcon}
        data={metrics.serviceExperience.trend}
      />
      <MetricCard
        title="差评风险 (差评行为分)"
        value={metrics.negativeReviewRisk.value}
        description="反映差评行为相关问题占比，数值越低风险越小。"
        change={metrics.negativeReviewRisk.change}
        icon={AlertTriangle}
        data={metrics.negativeReviewRisk.trend}
        isWarning
      />
    </div>
  );
}

export function SummaryBar({ summary }: { summary: DataCenterSummary }) {
  const { appTheme } = useThemeStore();
  const isEnterprise = appTheme === 'enterprise';

  const bgClass = isEnterprise
    ? 'bg-white dark:bg-[var(--card)] border-slate-100 dark:border-[var(--border)] shadow-sm dark:shadow-[0_20px_45px_-24px_rgba(0,0,0,0.85)]'
    : 'bg-white/90 dark:bg-[#0a101f]/80 border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none';
  const textClass = isEnterprise ? 'text-slate-700 dark:text-slate-300' : 'text-slate-700 dark:text-slate-300';
  return (
    <div className={`w-full rounded-xl border p-4 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center sm:gap-16 ${bgClass}`}>
      <div className="flex items-center justify-center gap-4">
        <div className={`p-2 rounded-full ${isEnterprise ? 'bg-blue-50 text-blue-500' : 'bg-blue-500/10 text-[#0ea5e9]'}`}>
           <Store className="w-5 h-5" />
        </div>
        <span className={`${textClass} font-medium`}>监控店铺数</span>
        <span className={`text-3xl font-bold ml-2 ${isEnterprise ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900 dark:text-white'}`}>{summary.monitoredShops} <span className={`text-sm font-normal ${textClass}`}>家</span></span>
      </div>
      
      <div className="h-px w-full bg-slate-200 dark:bg-white/10 sm:h-10 sm:w-px"></div>
      
      <div className="flex items-center justify-center gap-4">
        <div className={`p-2 rounded-full ${isEnterprise ? 'bg-blue-50 text-blue-500' : 'bg-blue-500/10 text-[#0ea5e9]'}`}>
          <ShieldCheck className="w-5 h-5" />
        </div>
        <span className={`${textClass} font-medium`}>数据覆盖率</span>
        <span className={`text-3xl font-bold ml-2 ${isEnterprise ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900 dark:text-white'}`}>{summary.dataCoverage}%</span>
      </div>
    </div>
  );
}
