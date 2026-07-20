import React from 'react';

export const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`
    relative overflow-hidden
    bg-white/80 dark:bg-[#0f172a]/40 backdrop-blur-xl 
    border border-slate-200 dark:border-white/[0.08] 
    rounded-[24px] 
    shadow-sm dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)]
    group
    ${className}
  `}>
    {/* Top Highlight */}
    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 dark:via-cyan-500/30 to-transparent opacity-50" />
    {children}
  </div>
);