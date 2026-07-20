import React from 'react';
import { cn } from '@/app/components/ui/utils';
import { GripHorizontal, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface CompassWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  onRemove?: () => void;
  isEditMode?: boolean;
  children: React.ReactNode;
  headerClassName?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  // Props injected by react-grid-layout
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

// ForwardRef is required by react-grid-layout to function correctly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CompassWidget = React.forwardRef<HTMLDivElement, CompassWidgetProps & { [key: string]: any }>(
  ({ title, onRemove, isEditMode, children, className, style, headerClassName, contentClassName, hideHeader, onMouseDown, onMouseUp, onTouchEnd, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        style={style}
        className={cn(
          "flex flex-col rounded-xl overflow-hidden transition-shadow duration-300",
          // Dark Mode: Glassmorphism + Cyberpunk border
          "dark:bg-slate-900/60 dark:backdrop-blur-md dark:border dark:border-cyan-500/30 dark:shadow-[0_0_15px_rgba(6,182,212,0.1)]",
          // Light Mode: Clean white card
          "bg-white border border-slate-200 shadow-sm hover:shadow-md",
          className
        )}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        {/* Header / Drag Handle */}
        {!hideHeader && (
          <div className={cn(
            "flex items-center justify-between px-4 py-3 border-b select-none",
            headerClassName,
            "dark:border-cyan-500/20 dark:bg-slate-900/40",
            "border-slate-100 bg-slate-50/50",
            isEditMode ? "cursor-move" : "cursor-default"
          )}>
            <h3 className={cn(
              "font-semibold text-sm tracking-wide flex items-center gap-2",
              "dark:text-slate-100 dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]",
              "text-slate-700"
            )}>
              {isEditMode && <GripHorizontal size={14} className="text-slate-400" />}
              {title}
            </h3>
            {isEditMode && onRemove && (
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent drag start
                  onRemove();
                }}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={cn(
          "flex-1 overflow-auto min-h-0 relative",
          contentClassName || "p-4"
        )}>
           {/* Scanline effect for Cyberpunk feel (optional, subtle) */}
           <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-0 opacity-0 dark:opacity-20 bg-[length:100%_4px,3px_100%]" />
           
           <div className="relative z-10 h-full">
             {children}
           </div>
        </div>
      </motion.div>
    );
  }
);

CompassWidget.displayName = "CompassWidget";

export default CompassWidget;
