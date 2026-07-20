'use client';

import React from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { Users } from 'lucide-react';
import { GlassCard } from '@/app/components/ui/glass-card';
import { NeonTitle } from '@/app/components/ui/neon-title';

const channelData = [
  { name: '直播带货 (Live)', value: 45, color: '#f472b6' },
  { name: '短视频 (Video)', value: 35, color: '#22d3ee' },
  { name: '商城 (Mall)', value: 20, color: '#818cf8' },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 dark:bg-[#050714]/90 border border-slate-200 dark:border-cyan-500/30 p-3 rounded-lg backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="text-slate-600 dark:text-slate-300">{data.name}:</span>
          <span className="font-bold font-mono" style={{ color: data.color }}>{data.value}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function ChannelPieWidget() {
  return (
    <div className="h-full flex flex-col">
      <NeonTitle icon={Users}>渠道分布</NeonTitle>
      <div className="flex-1 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={channelData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {channelData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  style={{ filter: `drop-shadow(0px 0px 6px ${entry.color})` }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">100%</span>
          <span className="text-[10px] text-slate-500 font-mono">来源</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 space-y-2">
        {channelData.map((item, i) => (
          <div key={i} className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 5px ${item.color}` }} />
              <span className="text-slate-600 dark:text-slate-300">{item.name}</span>
            </div>
            <span className="font-mono text-slate-900 dark:text-white">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
