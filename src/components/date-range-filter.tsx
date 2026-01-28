'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

const PREDEFINED_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Last Week', value: 'week' },
  { label: 'Last Month', value: 'month' },
  { label: 'Last 3 Months', value: '3months' },
  { label: 'Last 6 Months', value: '6months' },
  { label: 'Last Year', value: 'year' },
  { label: 'All Time', value: 'all' },
];

export function DateRangeFilter({ locale }: { locale: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = searchParams.get('range') || 'all';

  const handleRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('range');
    } else {
      params.set('range', value);
    }
    router.push(`/${locale}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-muted-foreground">Period:</span>
      {PREDEFINED_RANGES.map((range) => (
        <Button
          key={range.value}
          variant={currentRange === range.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleRangeChange(range.value)}
          className="h-8"
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}
