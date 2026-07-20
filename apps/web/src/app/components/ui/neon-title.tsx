import React from 'react';

export const NeonTitle = ({ children, icon: Icon, className = "" }: { children: React.ReactNode, icon?: any, className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    {Icon && <Icon size={16} className="text-blue-600 dark:text-cyan-400" />}
    <h3 className="text-xs font-mono tracking-[0.2em] text-slate-500 dark:text-cyan-200/60 uppercase">
      {children}
    </h3>
  </div>
);