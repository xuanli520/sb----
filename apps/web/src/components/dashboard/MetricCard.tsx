import React from 'react';
import { cn } from '@/app/components/ui/utils';
import { ChevronRight, AlertTriangle, Package, Truck, Headphones } from 'lucide-react';

interface MetricItem {
  label: string;
  score: number;
  isWarning?: boolean;
  subLabel?: string; // 对应“较前1日 持平”或“权重说明”
}

interface MetricCardProps {
  totalScore: number;
  totalLabel: string;
  items: MetricItem[];
  className?: string;
  category?: 'violation' | 'product' | 'logistics' | 'service' | string;
  onItemClick?: (item: MetricItem) => void;
}

export default function MetricCard({ 
  totalScore, 
  totalLabel, 
  items, 
  className, 
  category,
  onItemClick 
}: MetricCardProps) {

  // 根据分类获取图标配置
  const getCategoryConfig = () => {
    const iconClass = "w-5 h-5";
    if (category === 'violation' || totalLabel.includes('差行为')) {
      return {
        icon: <AlertTriangle className={iconClass} />,
        bgColor: "bg-gray-100 dark:bg-slate-800",
        iconColor: "text-gray-600 dark:text-slate-400"
      };
    }
    const config = {
      bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
      iconColor: "text-emerald-500 dark:text-emerald-400"
    };
    if (category === 'product' || totalLabel.includes('商品')) {
      return { ...config, icon: <Package className={iconClass} /> };
    }
    if (category === 'logistics' || totalLabel.includes('物流')) {
      return { ...config, icon: <Truck className={iconClass} /> };
    }
    if (category === 'service' || totalLabel.includes('服务')) {
      return { ...config, icon: <Headphones className={iconClass} /> };
    }
    return { icon: <Package className={iconClass} />, bgColor: "bg-gray-50 dark:bg-slate-800", iconColor: "text-gray-500 dark:text-slate-400" };
  };

  const { icon, bgColor, iconColor } = getCategoryConfig();

  return (
    <div className={cn(
      "flex flex-col h-full w-full bg-white dark:bg-slate-900/60 dark:backdrop-blur-md rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_0_15px_rgba(6,182,212,0.1)] border border-gray-100 dark:border-cyan-500/30 font-sans font-medium", 
      className
    )}>
      {/* 头部区域 */}
      <div className="flex flex-col mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("p-2 rounded-lg shrink-0", bgColor, iconColor)}>
            {icon}
          </div>
          <span className="text-lg font-medium text-gray-900 dark:text-slate-100">{totalLabel}</span>
        </div>

        <div className="flex items-baseline gap-1.5 ml-1">
          <span className="text-5xl font-bold text-gray-900 dark:text-slate-50 tracking-tight tabular-nums">
            {totalScore}
          </span>
          <span className="text-base text-gray-400 dark:text-slate-500">分</span>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar">
        {items.map((item, index) => {
          const isWarning = item.score < 60 || item.isWarning;
          
          return (
            <div 
              key={index} 
              onClick={() => onItemClick?.(item)}
              className={cn(
                "group flex items-center justify-between py-4 border-b border-gray-50 dark:border-slate-800 last:border-0 transition-all",
                onItemClick ? "cursor-pointer hover:bg-gray-50/80 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded-lg" : ""
              )}
            >
              {/* 左侧文字信息 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-base text-gray-800 dark:text-slate-200 font-medium leading-none">
                  {item.label}
                </span>
                {/* 对应“较前1日 持平”说明文字 */}
                <span className="text-sm text-gray-400 dark:text-slate-500 font-normal">
                  {item.subLabel || "较前1日 持平"}
                </span>
              </div>

              {/* 右侧分数（数字上方，文字下方）+ 箭头 */}
              <div className="flex items-center gap-4 ml-4 shrink-0">
                <div className="flex flex-col items-center min-w-[32px]">
                  <span className={cn(
                    "text-xl font-bold tabular-nums leading-tight",
                    isWarning ? "text-red-500" : "text-gray-900 dark:text-slate-100"
                  )}>
                    {item.score}
                  </span>
                  {/* “分”字移动到数字正下方 */}
                  <span className="text-xs text-gray-400 dark:text-slate-600 font-normal leading-none">
                    分
                  </span>
                </div>
                
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-700 group-hover:text-gray-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
