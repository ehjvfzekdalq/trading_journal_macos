'use client';

export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 6,
  showPercentage = false
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  showPercentage?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  // Color based on value
  const getColor = () => {
    if (value >= 60) return '#10b981'; // green
    if (value >= 40) return '#f59e0b'; // orange
    return '#ef4444'; // red
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold tabular-nums" style={{ color: getColor() }}>
            {value.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
