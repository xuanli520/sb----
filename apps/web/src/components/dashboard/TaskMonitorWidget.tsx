'use client';

import React from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { NeonTitle } from '@/app/components/ui/neon-title';

const tasksData = [
  { name: 'API 数据同步', progress: 100, status: 'success' },
  { name: '数据清洗', progress: 78, status: 'running' },
  { name: '日报生成', progress: 12, status: 'waiting' },
];

export default function TaskMonitorWidget() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <NeonTitle icon={RefreshCw}>任务状态</NeonTitle>
        <button className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline font-mono">
          查看日志
        </button>
      </div>
      <div className="space-y-5 flex-1 overflow-y-auto pr-1">
        {tasksData.map((task, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                {task.status === 'running' && <RefreshCw size={10} className="animate-spin text-cyan-600 dark:text-cyan-400"/>}
                {task.status === 'success' && <CheckCircle2 size={10} className="text-emerald-600 dark:text-emerald-400"/>}
                {task.name}
              </span>
              <span className="font-mono text-cyan-700 dark:text-cyan-100">{task.progress}%</span>
            </div>
            {/* Progress Bar Container */}
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              {/* Animated Progress Bar */}
              <div
                className={`h-full relative rounded-full ${
                  task.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' :
                  task.status === 'running' ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' :
                  'bg-slate-600'
                }`}
                style={{ width: `${task.progress}%` }}
              >
                {task.status === 'running' && (
                  <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] skew-x-[-20deg]" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
