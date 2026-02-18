'use client';

import { ComposedChart, Area, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { PROFIT_COLOR, LOSS_COLOR } from '@/lib/colors';

interface CumulativePnLChartProps {
  data: Array<{
    date: string;
    pnl: number;
  }>;
}

export function CumulativePnLChart({ data }: CumulativePnLChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  // Add interpolated zero crossing points
  const extendedData: Array<{ date: string; pnl: number }> = [];

  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const previous = i > 0 ? data[i - 1] : null;

    // Check if we're crossing zero
    if (previous && ((previous.pnl >= 0 && current.pnl < 0) || (previous.pnl < 0 && current.pnl >= 0))) {
      // Calculate interpolated zero crossing point
      const ratio = Math.abs(previous.pnl) / (Math.abs(previous.pnl) + Math.abs(current.pnl));
      const prevTime = new Date(previous.date).getTime();
      const currTime = new Date(current.date).getTime();
      const zeroTime = prevTime + ratio * (currTime - prevTime);
      const zeroDate = new Date(zeroTime).toISOString();

      // Add the zero crossing point
      extendedData.push({ date: zeroDate, pnl: 0 });
    }

    extendedData.push(current);
  }

  // Create chart data with color assignments
  const chartData = extendedData.map((d) => {
    const point: any = { date: d.date, pnl: d.pnl };

    // For positive values
    if (d.pnl >= 0) {
      point.positivePnl = d.pnl;
      point.positiveStroke = d.pnl;
    }

    // For negative values
    if (d.pnl < 0) {
      point.negativePnl = d.pnl;
      point.negativeStroke = d.pnl;
    }

    // Zero points belong to both for continuity
    if (d.pnl === 0) {
      point.positiveStroke = 0;
      point.negativeStroke = 0;
    }

    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <defs>
          <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PROFIT_COLOR} stopOpacity={0.3} />
            <stop offset="95%" stopColor={PROFIT_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="negativeGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="5%" stopColor={LOSS_COLOR} stopOpacity={0.3} />
            <stop offset="95%" stopColor={LOSS_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="date"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(value) => formatCurrency(value)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            padding: '8px 12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: '4px' }}
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString();
          }}
          formatter={(value: number) => {
            if (value === null || value === undefined) return ['', ''];
            return [formatCurrency(value), 'PNL'];
          }}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />

        {/* Positive area fill */}
        <Area
          type="monotone"
          dataKey="positivePnl"
          stroke="none"
          fill="url(#positiveGradient)"
          connectNulls={false}
        />

        {/* Negative area fill */}
        <Area
          type="monotone"
          dataKey="negativePnl"
          stroke="none"
          fill="url(#negativeGradient)"
          connectNulls={false}
        />

        {/* Positive line stroke */}
        <Line
          type="monotone"
          dataKey="positiveStroke"
          stroke={PROFIT_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />

        {/* Negative line stroke */}
        <Line
          type="monotone"
          dataKey="negativeStroke"
          stroke={LOSS_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
