import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CyberInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const CyberInput = React.forwardRef<HTMLInputElement, CyberInputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          // Light
          "bg-white/50 border-slate-200",
          // Dark
          "dark:bg-slate-900/50 dark:border-slate-700 dark:focus-visible:border-cyan-500/50 dark:focus-visible:shadow-[0_0_10px_rgba(6,182,212,0.2)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
CyberInput.displayName = "CyberInput";
