import React from 'react';
import { Clock } from 'lucide-react';

interface ScheduleDisplayProps {
  schedule?: string;
}

export function ScheduleDisplay({ schedule }: ScheduleDisplayProps) {
  if (!schedule) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" title={schedule}>
      <Clock size={14} />
      <span className="font-mono rounded bg-muted px-1">{schedule}</span>
    </div>
  );
}
