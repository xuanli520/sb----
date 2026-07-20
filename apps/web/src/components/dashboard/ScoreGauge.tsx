'use client';

import React, { useMemo } from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { cn } from '@/app/components/ui/utils';

interface ScoreGaugeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label, size = 'md', className }) => {
  // 1. 配置颜色逻辑
  const colorConfig = useMemo(() => {
    if (score >= 90) {
      return {
        // High: Emerald -> Teal
        hexStart: '#34d399',
        hexEnd: '#14b8a6',
        textGradient: 'from-emerald-400 to-teal-500',
        shadow: 'shadow-[0_0_15px_rgba(52,211,153,0.5)]',
        textColor: 'text-emerald-500'
      };
    } else if (score >= 60) {
      return {
        // Mid: Amber -> Orange
        hexStart: '#fbbf24',
        hexEnd: '#f97316',
        textGradient: 'from-amber-400 to-orange-500',
        shadow: 'shadow-[0_0_15px_rgba(251,191,36,0.5)]',
        textColor: 'text-amber-500'
      };
    } else {
      return {
        // Low: Rose -> Red
        hexStart: '#f43f5e',
        hexEnd: '#dc2626',
        textGradient: 'from-rose-500 to-red-600',
        shadow: 'shadow-[0_0_15px_rgba(244,63,94,0.5)]',
        textColor: 'text-rose-500'
      };
    }
  }, [score]);

  // 生成唯一 ID
  const gradientId = `score-gradient-${score}-${label?.replace(/\s+/g, '')}`;
  const data = [{ name: 'score', value: score, fill: `url(#${gradientId})` }];

  // 2. 尺寸配置
  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  }[size];

  // 3. 动态计算字号 (核心修复点)
  // 当分数为100时，字号降一级，防止3位数撑破容器或显得过于拥挤
  const getTextSize = () => {
    const isHundred = score >= 100;
    
    switch (size) {
      case 'sm':
        return isHundred ? 'text-xl' : 'text-2xl';
      case 'lg':
        return isHundred ? 'text-4xl' : 'text-5xl';
      case 'md':
      default:
        // md 默认是 3xl，100分时改为 2xl (或使用 text-[26px] 进行微调)
        return isHundred ? 'text-2xl' : 'text-3xl';
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("relative aspect-square", sizeClasses)}>
        <svg style={{ height: 0, width: 0, position: 'absolute' }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorConfig.hexStart} />
              <stop offset="100%" stopColor={colorConfig.hexEnd} />
            </linearGradient>
          </defs>
        </svg>

        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart 
            cx="50%" 
            cy="50%" 
            innerRadius="80%" 
            outerRadius="100%" 
            barSize={10} 
            data={data} 
            startAngle={200} 
            endAngle={-20}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: '#f3f4f6' }}
              dataKey="value"
              cornerRadius={10}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        
        {/* 中心内容区 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {/* 分数数字 */}
          <span className={cn(
            "font-bold font-mono tracking-tighter tabular-nums leading-none",
            "text-transparent bg-clip-text bg-gradient-to-br drop-shadow-sm filter",
            // 增加 px-1 防止 bg-clip-text 在某些浏览器切掉首尾像素
            "px-1", 
            getTextSize(),
            colorConfig.textGradient
          )}>
            {score}
          </span>
          
          {/* 标签 */}
          {label && (
            <span className={cn(
              "text-muted-foreground uppercase tracking-wider font-medium mt-1 text-center px-2 truncate w-full",
              size === 'sm' ? 'text-[10px]' : 'text-xs'
            )}>
              {label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoreGauge;