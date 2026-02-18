'use client';

import { PROFIT_COLOR, LOSS_COLOR } from '@/lib/colors';

export function SemiCircularProgress({
  value,
  size = 100,
  strokeWidth = 8,
  wins,
  total,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  wins?: number;
  total?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circle circumference
  const offset = circumference - (value / 100) * circumference;

  // Center coordinates
  const cy = size / 2;

  // Color based on value
  const getColor = () => {
    if (value >= 60) return PROFIT_COLOR;
    if (value >= 40) return '#f59e0b'; // orange
    return LOSS_COLOR;
  };

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size / 2 + 10} className="overflow-visible">
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2},${cy} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${cy}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeOpacity="0.2"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${strokeWidth / 2},${cy} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${cy}`}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {wins !== undefined && total !== undefined && (
        <div className="flex items-center gap-6 mt-1">
          <span className="text-xs font-medium text-muted-foreground">{wins}</span>
          <span className="text-xs font-medium text-muted-foreground">{total}</span>
        </div>
      )}
    </div>
  );
}
