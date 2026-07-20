import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Zap, Radio, GripHorizontal, Package, Truck, HeadphonesIcon, Award } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';

// 店铺状态映射（改名避免潜在重名冲突）
const SHOP_STATUS_LABELS: Record<string, string> = {
  live: '营业中',
  offline: '已离线',
  warning: '警告',
  critical: '严重',
};

// 店铺状态映射
const SHOP_STATUS_MAP: Record<string, string> = {
  live: '营业中',
  offline: '已离线',
  warning: '警告',
  critical: '严重',
};

export interface ShopData {
  id: string;
  name: string;
  score: number;
  status: 'live' | 'offline' | 'warning' | 'critical';
  risk: number;
  trend: number[];
  serviceScore: number;
  productScore: number;
  logisticsScore: number;
  comprehensiveScore: number;
}

interface ShopCardProps extends React.HTMLAttributes<HTMLDivElement> {
  shop: ShopData;
  isEditing: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

// 根据标签获取背景色
const getBackgroundClass = (label: string) => {
  if (label.includes('商品')) return 'bg-[#ECF5FF]';
  if (label.includes('物流')) return 'bg-[#F4F9EE]';
  if (label.includes('服务')) return 'bg-[#F9F3FF]';
  if (label.includes('差行为')) return 'bg-[#FFF2F2]';
  return 'bg-[#ECF5FF]';
};

// 四宫格单项组件
const GridItem = ({ 
  label, 
  score, 
  icon: Icon,
  colorIndex,
}: { 
  label: string; 
  score: number; 
  icon: React.ElementType;
  colorIndex: number;
}) => {
  const backgroundClass = getBackgroundClass(label);
  const isNegative = label.includes('差行为');

  return (
    <div className={cn(
      "relative flex h-full w-full overflow-hidden group rounded-lg border transition-all duration-300",
      "border-slate-100 dark:border-slate-800",
      "hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700",
      backgroundClass
    )}>
      <div className={cn(
        "absolute inset-0 z-10 bg-gradient-to-r",
        isNegative 
          ? "from-red-50/95 via-red-50/80 to-transparent dark:from-red-950/90 dark:via-red-950/60" 
          : "from-white/95 via-white/80 to-transparent dark:from-slate-900/95 dark:via-slate-900/80"
      )} />
      
      <div className="relative z-20 flex flex-col justify-center h-full px-4 w-2/3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 opacity-80">
            <Icon size={14} className={isNegative ? "text-red-500" : "text-slate-400 dark:text-slate-500"} />
            <span className={cn(
              "text-sm font-medium truncate",
              isNegative ? "text-red-700 dark:text-red-300" : "text-gray-500 dark:text-gray-400"
            )}>
              {label}
            </span>
          </div>
          <span className={cn(
            "text-4xl font-bold tracking-tight tabular-nums leading-none",
            isNegative ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
          )}>
            {score}
          </span>
        </div>
      </div>
    </div>
  );
};

const ShopCard = forwardRef<HTMLDivElement, ShopCardProps>(
  ({ shop, style, className, onMouseDown, onMouseUp, onTouchEnd, isEditing, onClick, ...props }, ref) => {
    const isHealthy = shop.score >= 90;
    const isRisk = shop.risk > 0 || shop.score < 60;
    
    const StatusIcon = shop.status === 'live' ? Zap : shop.status === 'warning' ? AlertTriangle : Radio;

    const gridItems = [
      { label: '商品体验', score: shop.productScore, icon: Package },
      { label: '物流体验', score: shop.logisticsScore, icon: Truck },
      { label: '服务体验', score: shop.serviceScore, icon: HeadphonesIcon },
      { label: '差行为', score: shop.risk, icon: AlertTriangle },
    ];

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "flex flex-col relative group overflow-hidden rounded-xl transition-all duration-300 bg-white dark:bg-slate-900",
          "border",
          isHealthy 
            ? "border-slate-200 dark:border-slate-800 hover:border-cyan-200 dark:hover:border-cyan-900/50" 
            : isRisk 
              ? "border-red-200 dark:border-red-900/30 shadow-[0_2px_10px_rgba(239,68,68,0.05)]"
              : "border-slate-200 dark:border-slate-800",
          "shadow-sm hover:shadow-lg",
          className
        )}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        onClick={!isEditing ? onClick : undefined}
        {...props}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-3 border-b select-none transition-colors",
          "border-slate-100 dark:border-slate-800",
          isEditing ? "cursor-move bg-slate-50 dark:bg-slate-800/50 drag-handle" : "cursor-pointer"
        )}>
          <div className="flex items-center gap-2.5 overflow-hidden">
             {isEditing && <GripHorizontal size={16} className="text-slate-400 shrink-0" />}
             
             <div className={cn(
               "p-1.5 rounded-md shrink-0 flex items-center justify-center transition-colors",
               isRisk 
                 ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' 
                 : 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400'
             )}>
                <StatusIcon size={16} strokeWidth={2.5} />
             </div>
             
             <span className="font-semibold text-base text-slate-700 dark:text-slate-200 truncate">
               {shop.name}
             </span>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {shop.status === 'live' && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            )}
            {/* 状态文字 */}
            <span className={cn(
              "text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded",
              isRisk ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            )}>
              {SHOP_STATUS_LABELS[shop.status] || shop.status}
            </span>
          </div>
        </div>

        {/* Body - 四宫格 */}
        <div className="p-3 bg-slate-50/50 dark:bg-black/20 flex-1 flex flex-col">
           <div className="pointer-events-none absolute inset-0 bg-[length:100%_4px] opacity-0 dark:opacity-5 z-0" 
                style={{backgroundImage: 'linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.2) 50%)'}} 
           />

           <div className="relative z-10 grid grid-cols-2 gap-2.5 h-full">
            {gridItems.map((item, index) => (
              <GridItem
                key={index}
                label={item.label}
                score={item.score}
                icon={item.icon}
                colorIndex={index}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
);

ShopCard.displayName = 'ShopCard';

export default ShopCard;
