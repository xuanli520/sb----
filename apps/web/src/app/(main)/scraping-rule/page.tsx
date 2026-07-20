'use client';

import React from 'react';
import { ScrapingRuleList } from '@/features/scraping-rule/components/ScrapingRuleList';

export default function ScrapingRulePage() {
  return (
    <div className="p-6 space-y-6">
      <ScrapingRuleList />
    </div>
  );
}
