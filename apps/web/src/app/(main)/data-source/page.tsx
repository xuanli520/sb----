import DataSourceList from '@/features/data-source/components/DataSourceList';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">加载中...</div>}>
      <DataSourceList />
    </Suspense>
  );
}