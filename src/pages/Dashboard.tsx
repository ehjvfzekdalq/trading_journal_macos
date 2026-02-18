import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Trade, type DashboardStats, type EquityCurvePoint, type Settings } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { formatPercent, getDateRangeTimestamp, type DateRange } from '../lib/utils';
import { TrendingUp, DollarSign, BarChart3, Calendar } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HelpBadge } from '../components/HelpBadge';
import { PositionMonitor } from '../components/PositionMonitor';
import { CurrencyDisplay } from '../components/CurrencyDisplay';
import { AnonymousToggle } from '../components/AnonymousToggle';
import { useAnonymousMode } from '../contexts/AnonymousModeContext';
import { createCurrencyFormatter, createTooltipFormatter } from '../lib/chartUtils';
import { TradeActivityCalendar } from '../components/TradeActivityCalendar';

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAnonymous } = useAnonymousMode();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Always load all data, then filter on frontend
      const [tradesData, statsData, equityCurveData] = await Promise.all([
        api.getTrades(),
        api.getDashboardStats(),
        api.getEquityCurve(),
      ]);

      // Filter data by date range on the frontend
      const startDate = getDateRangeTimestamp(dateRange);

      // Filter trades by date
      const filteredTrades = startDate
        ? tradesData.filter(trade => trade.trade_date >= startDate)
        : tradesData;

      // Calculate stats from filtered trades
      const closedTrades = filteredTrades.filter(t => t.status !== 'OPEN');
      const wins = closedTrades.filter(t => t.status === 'WIN').length;
      const losses = closedTrades.filter(t => t.status === 'LOSS').length;
      const breakevens = closedTrades.filter(t => t.status === 'BE').length;
      const openTrades = filteredTrades.filter(t => t.status === 'OPEN').length;

      const totalPnl = closedTrades.reduce((sum, t) => sum + (t.total_pnl || 0), 0);
      const grossProfit = closedTrades.filter(t => (t.total_pnl || 0) > 0).reduce((sum, t) => sum + (t.total_pnl || 0), 0);
      const grossLoss = Math.abs(closedTrades.filter(t => (t.total_pnl || 0) < 0).reduce((sum, t) => sum + (t.total_pnl || 0), 0));
      const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

      const bestTrade = closedTrades.length > 0
        ? Math.max(...closedTrades.map(t => t.total_pnl || 0))
        : 0;
      const worstTrade = closedTrades.length > 0
        ? Math.min(...closedTrades.map(t => t.total_pnl || 0))
        : 0;

      const avgEffectiveRR = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + (t.effective_weighted_rr || 0), 0) / closedTrades.length
        : 0;

      const filteredStats: DashboardStats = {
        total_trades: filteredTrades.length,
        wins,
        losses,
        breakevens,
        open_trades: openTrades,
        win_rate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
        total_pnl: totalPnl,
        gross_profit: grossProfit,
        gross_loss: grossLoss,
        profit_factor: profitFactor,
        avg_effective_rr: avgEffectiveRR,
        best_trade: bestTrade,
        worst_trade: worstTrade,
      };

      // Filter equity curve by date
      const filteredEquityCurve = startDate
        ? equityCurveData.filter(point => {
            const pointDate = new Date(point.date).getTime() / 1000;
            return pointDate >= startDate;
          })
        : equityCurveData;

      setTrades(filteredTrades);
      setStats(filteredStats);
      setEquityCurve(filteredEquityCurve);

      // Load settings separately - failure shouldn't break dashboard
      try {
        const settingsData = await api.getSettings();
        setSettings(settingsData);
      } catch (error) {
        console.error('Failed to load settings (non-critical):', error);
        // Settings default to null, which means features are hidden by default
      }
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
    <div className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            {t('dashboard.title')}
            <HelpBadge section="dashboard" />
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="overflow-x-auto scrollbar-thin flex-1 sm:flex-none">
              <div className="flex gap-1 border rounded-lg p-1 w-max sm:w-auto">
                {dateRangeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={dateRange === option.value ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setDateRange(option.value)}
                    className="h-7 text-xs whitespace-nowrap"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <AnonymousToggle />
          </div>
        </div>
      </div>

      {/* Position Monitor Widget */}
      {settings?.enable_position_monitor && <PositionMonitor />}

      {stats && (
        <>
          {/* Stats Grid */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.totalTrades')}</CardTitle>
                <BarChart3 className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold">{stats.total_trades}</div>
                <p className="text-[10px] text-muted-foreground">
                  {stats.open_trades} {t('dashboard.open')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.winRate')}</CardTitle>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold">{formatPercent(stats.win_rate / 100)}</div>
                <p className="text-[10px] text-muted-foreground">
                  {stats.wins}W / {stats.losses}L / {stats.breakevens}BE
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.finishedTradesPnL')}</CardTitle>
                <DollarSign className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className={`text-xl font-bold ${stats.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                  <CurrencyDisplay value={stats.total_pnl} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('dashboard.allClosedTrades')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.profitFactor')}</CardTitle>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold">
                  {stats.profit_factor === Infinity ? '∞' : stats.profit_factor.toFixed(2)}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  <CurrencyDisplay value={stats.gross_profit} /> / <CurrencyDisplay value={stats.gross_loss} />
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.bestTrade')}</CardTitle>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold text-success">
                  <CurrencyDisplay value={stats.best_trade} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-3">
                <CardTitle className="text-xs font-medium">{t('dashboard.worstTrade')}</CardTitle>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-xl font-bold text-destructive">
                  <CurrencyDisplay value={stats.worst_trade} />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Charts */}
      {equityCurve.length > 0 && (
        <div className="grid gap-2 md:grid-cols-1 lg:grid-cols-2">
          {/* Cumulative P&L Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('dashboard.equityCurve')}</CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              <ResponsiveContainer width="100%" height={250}>
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
                    tickFormatter={createCurrencyFormatter(isAnonymous)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [createTooltipFormatter(isAnonymous)(value), t('journal.pnl')]}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('dashboard.dailyPnL')}</CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              <ResponsiveContainer width="100%" height={250}>
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
                    tickFormatter={createCurrencyFormatter(isAnonymous)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [
                      createTooltipFormatter(isAnonymous)(value),
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

      {/* Trading Activity Calendar */}
      <TradeActivityCalendar trades={trades} />

      {/* Recent Trades */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('dashboard.recentTrades')}</CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {trades.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.noTradesMessage')}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {trades.slice(0, 5).map(trade => (
                <div
                  key={trade.id}
                  onClick={() => navigate(`/journal/${trade.id}`)}
                  className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{trade.pair}</div>
                      <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent">
                        {trade.position_type}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {trade.exchange} • {new Date(trade.trade_date * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      trade.status === 'WIN' ? 'text-success' :
                      trade.status === 'LOSS' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {trade.status}
                    </div>
                    {trade.total_pnl !== null && trade.total_pnl !== undefined && (
                      <div className={`text-xs ${trade.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                        <CurrencyDisplay value={trade.total_pnl} />
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
