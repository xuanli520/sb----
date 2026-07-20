import React from 'react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';

interface JsonConfigEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFormat: () => void;
  onReset: () => void;
  error?: string;
}

export function JsonConfigEditor({ value, onChange, onFormat, onReset, error }: JsonConfigEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onFormat}>
          格式化
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          重置
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-[260px] max-h-[260px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all [field-sizing:fixed] font-mono text-xs"
        wrap="soft"
        placeholder='{"shop_dashboard_login_state": {}}'
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
