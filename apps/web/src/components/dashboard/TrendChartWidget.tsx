'use client';

import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { GlassCard } from '@/app/components/ui/glass-card';
import { NeonTitle } from '@/app/components/ui/neon-title';

// --- Mock Data based on Requirements ---
const trendData = [
  { date: '10-24', gmv: 45000, orders: 320 },
  { date: '10-25', gmv: 52000, orders: 350 },
  { date: '10-26', gmv: 49000, orders: 310 },
  { date: '10-27', gmv: 62000, orders: 480 },
  { date: '10-28', gmv: 85000, orders: 620 },
  { date: '10-29', gmv: 78000, orders: 550 },
  { date: '10-30', gmv: 92000, orders: 680 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 dark:bg-[#050714]/90 border border-slate-200 dark:border-cyan-500/30 p-3 rounded-lg backdrop-blur-md shadow-lg dark:shadow-[0_0_20px_rgba(6,182,212,0.15)]">
        <p className="text-slate-900 dark:text-cyan-50 font-mono text-xs mb-1 border-b border-slate-200 dark:border-white/10 pb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs py-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600 dark:text-slate-300">{entry.name === 'gmv' ? 'GMV' : '订单'}:</span>
            <span className="font-bold font-mono" style={{ color: entry.color }}>
              {entry.name === 'gmv' ? `¥${entry.value.toLocaleString()}` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrendChartWidget() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <NeonTitle icon={TrendingUp}>运营趋势</NeonTitle>
        <div className="flex gap-4">
          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_5px_#22d3ee]"></span> GMV
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_#818cf8]"></span> 订单
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="colorGmvNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOrdersNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#475569"
              tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#475569"
              tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#475569"
              tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="gmv"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#colorGmvNew)"
              style={{ filter: 'drop-shadow(0px 0px 4px rgba(34, 211, 238, 0.5))' }}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              stroke="#818cf8"
              strokeWidth={2}
              fill="url(#colorOrdersNew)"
              style={{ filter: 'drop-shadow(0px 0px 4px rgba(129, 140, 248, 0.5))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
