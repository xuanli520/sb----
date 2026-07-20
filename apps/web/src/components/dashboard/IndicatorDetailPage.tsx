import React from 'react';
import { ChevronLeft, Download, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Indicator } from '@/types/indicator';

interface IndicatorDetailPageProps {
  indicator: Indicator;
  onBack: () => void;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'indicator-detail';
}

function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function IndicatorDetailPage({
  indicator,
  onBack,
}: IndicatorDetailPageProps) {
  // 找到当前得分所在的区间
  const getCurrentRange = () => {
    for (let i = 0; i < indicator.scoreRanges.length; i++) {
      const range = indicator.scoreRanges[i];
      if (range.score === indicator.score) {
        return range;
      }
    }
    return indicator.scoreRanges[indicator.scoreRanges.length - 1];
  };

  const currentRange = getCurrentRange();
  const handleExportIndicatorData = () => {
    downloadJsonFile(`${sanitizeFilename(indicator.name)}-indicator-detail.json`, {
      exportedAt: new Date().toISOString(),
      indicator,
      currentRange,
    });
  };

  return (
    <div className="w-full text-foreground transition-colors duration-300">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-muted rounded-md transition-colors"
                aria-label="返回"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <span className="text-foreground">{indicator.categoryName}</span>
                  <span className="text-muted-foreground text-sm font-normal">
                    系统在线
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                  <span>更新时间：2026/02/07 11:00:36</span>
                  <button className="text-primary-high hover:underline font-medium">
                    今日已更新
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Score Card */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6 relative">
          <button
            type="button"
            onClick={handleExportIndicatorData}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="导出数据"
            title="导出数据"
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="flex flex-col md:flex-row items-start justify-between gap-8">
            <div className="flex-shrink-0">
              <h2 className="text-lg font-medium mb-2 text-muted-foreground">
                {indicator.categoryName}得分
              </h2>
              <div className="flex items-baseline gap-2 text-foreground">
                <span className="text-5xl font-bold tracking-tight">
                  {indicator.score}
                </span>
                <span className="text-muted-foreground text-lg">分</span>
              </div>
              <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-muted text-xs">
                  较前1日 持平
                </span>
              </div>
            </div>

            {/* Formula Display for Category Score */}
            <div className="flex-1 w-full max-w-2xl bg-muted/30 border border-border/50 rounded-lg p-6 pr-14 backdrop-blur-sm">
              <div className="flex items-start gap-3 mb-4">
                <div className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 shadow-sm">
                  =
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground mb-1">
                    {indicator.name}
                  </h3>
                  <div className="text-sm text-muted-foreground font-mono">
                    ×{indicator.weight}%权重 ={' '}
                    <span className="text-foreground font-semibold">
                      {(indicator.weight * indicator.score) / 100}
                    </span>
                    分
                  </div>
                </div>
              </div>
              {indicator.categoryId !== 'violation' && (
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 shadow-sm">
                    +
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">
                      其他小指标得分
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Calculation Rules */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          <h3 className="text-lg font-medium mb-6 text-foreground border-l-4 border-primary pl-3">
            计算规则
          </h3>

          {/* Step 1: Score Range */}
          <div className="mb-8 relative pl-8 before:absolute before:left-3 before:top-8 before:bottom-0 before:w-px before:bg-border">
            <div className="absolute left-0 top-0 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow-sm z-10">
              1
            </div>
            <div className="mb-4">
              <div className="font-medium text-foreground mb-4 flex items-center justify-between">
                <span>根据「{indicator.name}」对应得分</span>
                <button className="text-primary-high hover:underline text-sm font-normal">
                  收起得分区间
                </button>
              </div>

              {/* Score Range Chart */}
              <div className="relative pt-8 pb-2">
                {/* Range Bar */}
                <div className="relative h-14 mb-2 flex rounded-md overflow-hidden ring-1 ring-border">
                  {indicator.scoreRanges.map((range, index) => {
                    const isActive = range.score === indicator.score;
                    return (
                      <div
                        key={index}
                        className={`flex-1 relative transition-all duration-300 ${
                          isActive
                            ? 'bg-primary/20 backdrop-blur-sm'
                            : 'bg-muted/50'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium shadow-lg whitespace-nowrap z-20 animate-in fade-in zoom-in duration-300">
                            当前得分 {range.score}分
                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-primary"></div>
                          </div>
                        )}
                        {/* Add a subtle separator */}
                        {index !== indicator.scoreRanges.length - 1 && (
                          <div className="absolute right-0 top-2 bottom-2 w-px bg-border/50"></div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Scale & Labels Grid */}
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs text-muted-foreground mt-4">
                  {/* Scores Row */}
                  <div className="text-right pr-2 py-1">得分</div>
                  <div className="flex justify-between">
                    {indicator.scoreRanges.map((range, index) => (
                      <div key={index} className="flex-1 text-center font-mono">
                        {range.score}
                      </div>
                    ))}
                  </div>

                  {/* Values Row */}
                  <div className="text-right pr-2 py-1">
                    「{indicator.name}」
                  </div>
                  <div className="flex justify-between">
                    {indicator.scoreRanges.map((range, index) => (
                      <div
                        key={index}
                        className="flex-1 text-center font-medium text-foreground"
                      >
                        {range.value}
                      </div>
                    ))}
                  </div>

                  {/* Ranges Row */}
                  <div className="text-right pr-2 py-1 opacity-0">范围</div>
                  <div className="flex justify-between">
                    {indicator.scoreRanges.map((range, index) => (
                      <div key={index} className="flex-1 text-center text-[10px]">
                        {range.range}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Calculation Method */}
          <div className="relative pl-8">
            <div className="absolute left-0 top-0 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow-sm z-10">
              2
            </div>
            <div>
              <div className="font-medium text-foreground mb-4">
                「{indicator.name}」计算方法
              </div>

              {indicator.categoryId !== 'violation' ? (
                <div className="space-y-6">
                  {/* Formula Visualization */}
                  <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 bg-muted/20 p-6 rounded-lg border border-border/50">
                    <div className="text-center md:text-left">
                      <div className="text-sm text-muted-foreground mb-1">
                        {indicator.formula.variables[0]?.name || indicator.name}
                      </div>
                      <div className="text-3xl font-bold text-foreground font-mono">
                        {indicator.formula.variables[0]?.value.toFixed(
                          indicator.categoryId === 'product'
                            ? 4
                            : indicator.categoryId === 'logistics'
                            ? 3
                            : 3
                        ) || indicator.score}
                        <span className="text-base font-normal text-muted-foreground ml-1">
                          {indicator.categoryId === 'logistics' && '%'}
                          {indicator.categoryId === 'service' && '秒'}
                        </span>
                      </div>
                    </div>

                    <div className="text-muted-foreground text-2xl font-light">
                      =
                    </div>

                    <div className="flex-1 text-center md:text-left">
                      <div className="text-sm text-muted-foreground mb-1">
                        {indicator.formula.variables[1]?.name || '计算值'}
                      </div>
                      <div className="text-xl font-semibold text-foreground font-mono">
                        {indicator.formula.variables[1]?.value || 0}
                      </div>
                    </div>

                    <div className="text-muted-foreground text-2xl font-light">
                      ÷
                    </div>

                    <div className="flex-1 text-center md:text-left">
                      <div className="text-sm text-muted-foreground mb-1">
                        {indicator.formula.variables[2]?.name || '总数'}
                      </div>
                      <div className="text-xl font-semibold text-foreground font-mono">
                        {indicator.formula.variables[2]?.value || 0}
                      </div>
                    </div>
                  </div>

                  {/* Formula Text */}
                  {indicator.formula.display && (
                    <div className="bg-muted/40 p-4 rounded-md text-sm text-muted-foreground border border-border/50 flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5 text-primary-high" />
                      {indicator.formula.display}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-border/50 border-dashed">
                  {indicator.formula.display}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {indicator.notes.length > 0 && (
            <div className="mt-8 bg-warning/10 border border-warning/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground space-y-2">
                  <div className="font-medium text-warning-foreground">
                    注释
                  </div>
                  {indicator.notes.map((note, index) => (
                    <div key={index} className="leading-relaxed text-foreground/80">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Chart */}
        {indicator.trend.length > 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-medium text-foreground border-l-4 border-primary pl-3">
                  分析诊断
                </h3>
                <div className="text-xs text-muted-foreground mt-1 ml-4">
                  统计日期：2026/01/08 - 2026/02/06
                </div>
              </div>
              <div className="flex bg-muted/50 p-1 rounded-lg self-start sm:self-auto">
                <button className="px-3 py-1 text-sm font-medium rounded-md text-muted-foreground hover:bg-background hover:text-foreground transition-all">
                  单天口径
                </button>
                <button className="px-3 py-1 text-sm font-medium rounded-md bg-background text-primary-high shadow-sm">
                  30天口径
                </button>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                近30日指标趋势
              </h4>
            </div>

            {/* Trend Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={indicator.trend}>
                  <defs>
                    <linearGradient
                      id="colorValue"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--primary-high)"
                        stopOpacity={0.1}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--primary-high)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="currentColor"
                    className="text-muted-foreground text-xs"
                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.6 }}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="currentColor"
                    className="text-muted-foreground text-xs"
                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.6 }}
                    tickLine={false}
                    axisLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      borderColor: 'var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--popover-foreground)',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary-high)"
                    strokeWidth={3}
                    dot={{
                      fill: 'var(--background)',
                      stroke: 'var(--primary-high)',
                      strokeWidth: 2,
                      r: 4,
                    }}
                    activeDot={{
                      fill: 'var(--primary-high)',
                      stroke: 'var(--background)',
                      strokeWidth: 2,
                      r: 6,
                    }}
                    name="商家"
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary-high"></span>
                <span className="text-muted-foreground">商家得分</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-primary-high/50 border-dashed"></span>
                <span className="text-muted-foreground">行业平均 (暂无)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
