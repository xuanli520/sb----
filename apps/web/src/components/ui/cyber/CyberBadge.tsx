import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CyberBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline';
}

export function CyberBadge({ children, className, variant = 'default', ...props }: CyberBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        
        // Default (Info/Blue)
        variant === 'default' && [
          "bg-blue-100 text-blue-800",
          "dark:bg-blue-900/30 dark:text-blue-300 dark:border dark:border-blue-500/30 dark:shadow-[0_0_10px_rgba(59,130,246,0.2)]"
        ],

        // Success (Green/Neon)
        variant === 'success' && [
          "bg-green-100 text-green-800",
          "dark:bg-emerald-900/30 dark:text-emerald-300 dark:border dark:border-emerald-500/30 dark:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
        ],

        // Warning (Orange)
        variant === 'warning' && [
          "bg-yellow-100 text-yellow-800",
          "dark:bg-orange-900/30 dark:text-orange-300 dark:border dark:border-orange-500/30 dark:shadow-[0_0_10px_rgba(249,115,22,0.2)]"
        ],

        // Error (Red)
        variant === 'error' && [
          "bg-red-100 text-red-800",
          "dark:bg-red-900/30 dark:text-red-300 dark:border dark:border-red-500/30 dark:shadow-[0_0_10px_rgba(239,68,68,0.2)]"
        ],

        // Outline
        variant === 'outline' && "text-foreground border border-slate-200 dark:border-slate-700",

        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
