import React from 'react';
import { cn } from '@/app/components/ui/utils';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
  icon?: React.ElementType;
}

export function EmptyState({ 
  title = "暂无数据", 
  description = "当前没有匹配的数据", 
  className,
  icon: Icon = FileQuestion
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="bg-muted/50 rounded-full p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {description}
      </p>
    </div>
  );
}
