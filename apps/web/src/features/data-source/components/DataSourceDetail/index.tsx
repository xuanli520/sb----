import React from 'react';
import { DataSource } from '../../services/types';
import { InfoCard } from './InfoCard';
import { AssociatedRules } from './AssociatedRules';
import { LoginStateMetaCard } from './LoginStateMetaCard';

interface DataSourceDetailProps {
  dataSource: DataSource;
  onRefresh?: () => Promise<void> | void;
}

export function DataSourceDetail({ dataSource, onRefresh }: DataSourceDetailProps) {
  return (
    <>
      <InfoCard dataSource={dataSource} onRefresh={onRefresh} />
      <LoginStateMetaCard meta={dataSource.config.shop_dashboard_login_state_meta} />
      <AssociatedRules dataSourceId={dataSource.id} />
    </>
  );
}
