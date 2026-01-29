import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Trade, type DashboardStats, type EquityCurvePoint } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { formatCurrency, formatPercent, getDateRangeTimestamp, type DateRange } from '../lib/utils';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Calendar } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HelpBadge } from '../components/HelpBadge';

export default function Dashboard() {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = getDateRangeTimestamp(dateRange);
      const filters = startDate ? { start_date: startDate } : undefined;

      // Map dashboard date range to backend format
      const backendDateRange = dateRange === 'all' ? undefined :
                               dateRange === '7d' ? 'week' :
                               dateRange === '30d' ? 'month' :
                               dateRange === '90d' ? '3months' :
                               dateRange === '180d' ? '6months' :
                               dateRange === '365d' ? 'year' : undefined;

      const [tradesData, statsData, equityCurveData] = await Promise.all([
        api.getTrades(filters),
        api.getDashboardStats(backendDateRange),
        api.getEquityCurve(backendDateRange),
      ]);
      setTrades(tradesData);
      setStats(statsData);
      setEquityCurve(equityCurveData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  const dateRangeOptions = [
    { value: 'all' as DateRange, label: t('dashboard.dateRange.allTime') },
    { value: '7d' as DateRange, label: t('dashboard.dateRange.lastWeek') },
    { value: '30d' as DateRange, label: t('dashboard.dateRange.lastMonth') },
    { value: '90d' as DateRange, label: t('dashboard.dateRange.3months') },
    { value: '180d' as DateRange, label: t('dashboard.dateRange.6months') },
    { value: '365d' as DateRange, label: t('dashboard.dateRange.year') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {t('dashboard.title')}
            <HelpBadge section="dashboard" />
          </h1>
          <p className="text-muted-foreground">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1 border rounded-lg p-1">
            {dateRangeOptions.map((option) => (
              <Button
                key={option.value}
                variant={dateRange === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDateRange(option.value)}
                className="h-7 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {stats && (
        <>
          {/* Main Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard.totalTrades')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_trades}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.open_trades} {t('dashboard.open')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard.winRate')}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPercent(stats.win_rate / 100)}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.wins}W / {stats.losses}L / {stats.breakevens}BE
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard.finishedTradesPnL')}</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(stats.total_pnl)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.allClosedTrades')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('dashboard.profitFactor')}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.profit_factor === Infinity ? '∞' : stats.profit_factor.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.gross_profit)} / {formatCurrency(stats.gross_loss)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Additional Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('dashboard.bestTrade')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  {formatCurrency(stats.best_trade)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('dashboard.worstTrade')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(stats.worst_trade)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('dashboard.avgEffectiveRR')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.avg_effective_rr.toFixed(2)}:1
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Charts */}
      {equityCurve.length > 0 && (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {/* Cumulative P&L Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.equityCurve')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [formatCurrency(value), t('journal.pnl')]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative_pnl"
                    stroke={stats && stats.total_pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Daily P&L Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.dailyPnL')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'daily_pnl' ? t('dashboard.dailyPnL') : name
                    ]}
                  />
                  <Bar
                    dataKey="daily_pnl"
                    radius={[4, 4, 0, 0]}
                  >
                    {equityCurve.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.daily_pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentTrades')}</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {t('dashboard.noTradesMessage')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trades.slice(0, 5).map(trade => (
                <div key={trade.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{trade.pair}</div>
                      <div className="text-xs px-2 py-1 rounded-full bg-accent">
                        {trade.position_type}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {trade.exchange} • {new Date(trade.trade_date * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${
                      trade.status === 'WIN' ? 'text-success' :
                      trade.status === 'LOSS' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {trade.status}
                    </div>
                    {trade.total_pnl !== null && trade.total_pnl !== undefined && (
                      <div className={`text-sm ${trade.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(trade.total_pnl)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
