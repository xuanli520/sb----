'use client';

import { useEffect } from 'react';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import { CyberCard } from '@/components/ui/cyber/CyberCard';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <CyberCard className="p-8 max-w-md text-center space-y-4 border-red-500/30 bg-red-950/10">
        <h2 className="text-xl font-bold text-red-500">页面加载失败</h2>
        <p className="text-muted-foreground text-slate-400">
          {error.message || '加载管理后台数据时发生异常，请稍后重试。'}
        </p>
        <CyberButton onClick={() => reset()} className="w-full">
          重试
        </CyberButton>
      </CyberCard>
    </div>
  );
}
