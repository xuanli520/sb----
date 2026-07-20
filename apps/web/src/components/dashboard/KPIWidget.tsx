'use client';

import React from 'react';
import {
  TrendingUp, Users, ShoppingBag, CreditCard, Activity
} from 'lucide-react';
import { GlassCard } from '@/app/components/ui/glass-card';
import { NeonTitle } from '@/app/components/ui/neon-title';

const KPIData = [
  { title: '预估总GMV', value: '¥ 1,245,890', trend: 12.5, icon: CreditCard },
  { title: '总订单量', value: '8,520', trend: 5.2, icon: ShoppingBag },
  { title: '转化率', value: '4.85%', trend: -0.8, icon: Activity },
  { title: '活跃用户', value: '32,100', trend: 18.1, icon: Users },
];

export default function KPIWidget() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full">
      {KPIData.map((item, index) => (
        <GlassCard key={index} className="p-4 flex flex-col justify-center hover:bg-white/80 dark:hover:bg-[#0f172a]/60 transition-colors cursor-pointer border-l-2 border-l-transparent hover:border-l-cyan-400">
          <div className="flex justify-between items-start mb-2">
            <div className="text-slate-500 dark:text-slate-400 text-[10px] font-mono uppercase tracking-wider">{item.title}</div>
            <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-cyan-600 dark:text-cyan-400 shadow-sm dark:shadow-[0_0_10px_rgba(34,211,238,0.1)]`}>
              <item.icon size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight drop-shadow-sm dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              {item.value}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-medium ${item.trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {item.trend >= 0 ? '+' : ''}{item.trend}%
              </span>
              <span className="text-[10px] text-slate-500 font-mono">较昨日</span>
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
