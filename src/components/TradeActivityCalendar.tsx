import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

interface Trade {
  id: string;
  trade_date: number;
  status: string;
}

interface TradeActivityCalendarProps {
  trades: Trade[];
}

export function TradeActivityCalendar({ trades }: TradeActivityCalendarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Get available years from trades
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    trades.forEach(trade => {
      const date = new Date(trade.trade_date * 1000);
      years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a); // Sort descending
  }, [trades]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
  });

  // Calculate trade counts per day for selected year
  const tradesByDate = useMemo(() => {
    const map = new Map<string, number>();

    trades.forEach(trade => {
      const date = new Date(trade.trade_date * 1000);
      if (date.getFullYear() === selectedYear) {
        const dateKey = date.toISOString().split('T')[0];
        map.set(dateKey, (map.get(dateKey) || 0) + 1);
      }
    });

    return map;
  }, [trades, selectedYear]);

  // Get color based on trade count
  const getColor = (count: number): string => {
    if (count === 0) return 'bg-muted/30';
    if (count === 1) return 'bg-violet-300/50 dark:bg-violet-900/30';
    if (count === 2) return 'bg-violet-400/60 dark:bg-violet-800/40';
    if (count === 3) return 'bg-violet-500/70 dark:bg-violet-700/50';
    if (count >= 4) return 'bg-violet-600/80 dark:bg-violet-600/60';
    return 'bg-muted/30';
  };

  // Generate calendar data
  const calendarData = useMemo(() => {
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31);

    // Find the Monday before or on the start date
    const firstDay = new Date(startDate);
    const dayOfWeek = firstDay.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    firstDay.setDate(firstDay.getDate() - daysToMonday);

    // Find the Sunday after or on the end date
    const lastDay = new Date(endDate);
    const lastDayOfWeek = lastDay.getDay();
    const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
    lastDay.setDate(lastDay.getDate() + daysToSunday);

    const weeks: Array<Array<{ date: Date; count: number; isCurrentYear: boolean }>> = [];
    let currentWeek: Array<{ date: Date; count: number; isCurrentYear: boolean }> = [];

    const current = new Date(firstDay);
    while (current <= lastDay) {
      const dateKey = current.toISOString().split('T')[0];
      const count = tradesByDate.get(dateKey) || 0;
      const isCurrentYear = current.getFullYear() === selectedYear;

      currentWeek.push({
        date: new Date(current),
        count,
        isCurrentYear
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedYear, tradesByDate]);

  // Get month labels
  const monthLabels = useMemo(() => {
    const labels: Array<{ month: string; offset: number }> = [];
    let lastMonth = -1;

    calendarData.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0];
      if (firstDayOfWeek.isCurrentYear) {
        const month = firstDayOfWeek.date.getMonth();
        if (month !== lastMonth) {
          labels.push({
            month: firstDayOfWeek.date.toLocaleDateString('en-US', { month: 'short' }),
            offset: weekIndex
          });
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [calendarData]);

  // Count total trades in selected year
  const totalTrades = useMemo(() => {
    return Array.from(tradesByDate.values()).reduce((sum, count) => sum + count, 0);
  }, [tradesByDate]);

  // Handle square click - navigate to journal with date filter
  const handleDayClick = (date: Date, count: number) => {
    if (count > 0) {
      const dateStr = date.toISOString().split('T')[0];
      navigate(`/journal?date=${dateStr}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 px-3 md:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="text-xs sm:text-sm font-semibold">
            {totalTrades} {t('dashboard.tradesInYear') || 'trades in'} {selectedYear}
          </div>
          {availableYears.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {availableYears.map(year => (
                <Button
                  key={year}
                  variant={year === selectedYear ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedYear(year)}
                  className="h-6 sm:h-7 text-[10px] sm:text-xs px-1.5 sm:px-2"
                >
                  {year}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6">
        <div className="overflow-x-auto overflow-y-hidden">
          <div className="inline-block min-w-full pb-2">
            {/* Month labels - Mobile */}
            <div className="sm:hidden flex items-center mb-1 ml-6 relative" style={{ height: '16px' }}>
              {monthLabels.map((label, index) => (
                <div
                  key={index}
                  className="text-[9px] text-muted-foreground absolute"
                  style={{
                    left: `${label.offset * 10}px`
                  }}
                >
                  {label.month.charAt(0)}
                </div>
              ))}
            </div>

            {/* Month labels - Desktop */}
            <div className="hidden sm:flex items-center mb-1 ml-8 relative" style={{ height: '16px' }}>
              {monthLabels.map((label, index) => (
                <div
                  key={index}
                  className="text-[10px] text-muted-foreground absolute"
                  style={{
                    left: `${label.offset * 13}px`
                  }}
                >
                  {label.month}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex gap-0.5 sm:gap-1 mt-3 sm:mt-5">
              {/* Day labels */}
              <div className="flex flex-col gap-[2px] sm:gap-[3px] pr-1 sm:pr-2">
                <div className="h-[8px] sm:h-[10px]"></div>
                <div className="h-[8px] sm:h-[10px] text-[9px] sm:text-[10px] text-muted-foreground flex items-center">Mon</div>
                <div className="h-[8px] sm:h-[10px]"></div>
                <div className="h-[8px] sm:h-[10px] text-[9px] sm:text-[10px] text-muted-foreground flex items-center">Wed</div>
                <div className="h-[8px] sm:h-[10px]"></div>
                <div className="h-[8px] sm:h-[10px] text-[9px] sm:text-[10px] text-muted-foreground flex items-center">Fri</div>
                <div className="h-[8px] sm:h-[10px]"></div>
              </div>

              {/* Weeks grid */}
              <div className="flex gap-[2px] sm:gap-[3px]">
                {calendarData.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[2px] sm:gap-[3px]">
                    {week.map((day, dayIndex) => (
                      <div
                        key={dayIndex}
                        className={cn(
                          'w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm transition-all',
                          day.isCurrentYear ? getColor(day.count) : 'bg-transparent',
                          day.isCurrentYear && day.count > 0 && 'hover:ring-1 hover:ring-violet-500 cursor-pointer hover:scale-110'
                        )}
                        title={
                          day.isCurrentYear
                            ? `${day.date.toLocaleDateString()}: ${day.count} trade${day.count !== 1 ? 's' : ''}`
                            : ''
                        }
                        onClick={() => day.isCurrentYear && handleDayClick(day.date, day.count)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-start sm:justify-end gap-1.5 sm:gap-2 mt-3 text-[9px] sm:text-[10px] text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-0.5 sm:gap-1">
                <div className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm bg-muted/30" />
                <div className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm bg-violet-300/50 dark:bg-violet-900/30" />
                <div className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm bg-violet-400/60 dark:bg-violet-800/40" />
                <div className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm bg-violet-500/70 dark:bg-violet-700/50" />
                <div className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-[2px] sm:rounded-sm bg-violet-600/80 dark:bg-violet-600/60" />
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
