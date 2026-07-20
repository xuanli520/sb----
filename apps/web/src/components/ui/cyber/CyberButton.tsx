import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export function CyberButton({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  disabled,
  ...props 
}: CyberButtonProps) {
  return (
    <button
      disabled={isLoading || disabled}
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        
        // Sizes
        size === 'sm' && "h-8 px-3 text-xs",
        size === 'md' && "h-10 px-4 text-sm",
        size === 'lg' && "h-12 px-6 text-base",
        size === 'icon' && "h-10 w-10",

        // Variants
        
        // Primary: Cyan Glow in Dark, Solid Dark in Light
        variant === 'primary' && [
          "bg-slate-900 text-white hover:bg-slate-800 border border-transparent", // Light mode
          "dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-500/50",
          "dark:hover:bg-cyan-900/50 dark:hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] dark:hover:border-cyan-400",
        ],

        // Secondary: Amber/Peach in Dark, Soft Gray in Light
        variant === 'secondary' && [
          "bg-slate-100 text-slate-900 hover:bg-slate-200",
          "dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-500/50",
          "dark:hover:bg-orange-900/50 dark:hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]",
        ],

        // Danger
        variant === 'danger' && [
          "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
          "dark:bg-red-950/30 dark:text-red-400 dark:border-red-500/50",
          "dark:hover:bg-red-900/50 dark:hover:shadow-[0_0_15px_rgba(248,113,113,0.3)]",
        ],

        // Ghost
        variant === 'ghost' && [
          "hover:bg-slate-100 text-slate-600",
          "dark:text-slate-400 dark:hover:text-cyan-300 dark:hover:bg-cyan-950/30",
        ],
        
         // Outline
        variant === 'outline' && [
          "border border-slate-300 bg-transparent hover:bg-slate-50 text-slate-700",
          "dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/50",
        ],

        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
