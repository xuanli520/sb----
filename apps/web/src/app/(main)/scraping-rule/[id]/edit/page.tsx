'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { EditForm } from '@/features/scraping-rule/components/ScrapingRuleForm/EditForm';

export default function EditScrapingRulePage() {
  const params = useParams();
  const id = Number(params.id);

  return (
    <div className="py-6 space-y-6">
      <EditForm id={id} />
    </div>
  );
}
