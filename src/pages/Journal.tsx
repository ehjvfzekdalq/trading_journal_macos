import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Trade } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { formatCurrency } from '../lib/utils';
import { Plus, Eye, Calendar, Search } from 'lucide-react';

type DateRange = 'all' | '7d' | '30d' | '90d' | '180d' | '365d';
type StatusFilter = 'all' | 'OPEN' | 'WIN' | 'LOSS' | 'BE';

const getDateRangeTimestamp = (range: DateRange): number | undefined => {
  if (range === 'all') return undefined;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (range) {
    case '7d': return Math.floor((now - 7 * day) / 1000);
    case '30d': return Math.floor((now - 30 * day) / 1000);
    case '90d': return Math.floor((now - 90 * day) / 1000);
    case '180d': return Math.floor((now - 180 * day) / 1000);
    case '365d': return Math.floor((now - 365 * day) / 1000);
    default: return undefined;
  }
};

export default function Journal() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTrades();
  }, [dateRange, statusFilter]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const startDate = getDateRangeTimestamp(dateRange);
      const filters: any = {};

      if (startDate) filters.start_date = startDate;
      if (statusFilter !== 'all') filters.status = statusFilter;

      console.log('Loading trades with filters:', filters);
      const data = await api.getTrades(Object.keys(filters).length > 0 ? filters : undefined);
      console.log('Loaded', data.length, 'trades');
      setTrades(data);
    } catch (error) {
      console.error('Failed to load trades:', error);
    } finally {
      setLoading(false);
    }
  };

  // Client-side filter for search (must be before early return)
  const filteredTrades = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) {
      return trades;
    }

    const query = searchQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!query) {
      return trades;
    }

    return trades.filter(trade => {
      if (!trade || !trade.pair) {
        return false;
      }
      const pair = trade.pair.toLowerCase().replace(/[^a-z0-9]/g, '');
      return pair.includes(query);
    });
  }, [trades, searchQuery]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const dateRangeOptions = [
    { value: 'all' as DateRange, label: t('dashboard.dateRange.allTime') || 'All Time' },
    { value: '7d' as DateRange, label: t('dashboard.dateRange.lastWeek') || 'Last Week' },
    { value: '30d' as DateRange, label: t('dashboard.dateRange.lastMonth') || 'Last Month' },
    { value: '90d' as DateRange, label: t('dashboard.dateRange.3months') || '3 Months' },
    { value: '180d' as DateRange, label: t('dashboard.dateRange.6months') || '6 Months' },
    { value: '365d' as DateRange, label: t('dashboard.dateRange.year') || 'Year' },
  ];

  const statusOptions = [
    { value: 'all' as StatusFilter, label: t('dashboard.dateRange.allTime') || 'All' },
    { value: 'OPEN' as StatusFilter, label: t('common.open') || 'Open' },
    { value: 'WIN' as StatusFilter, label: t('common.win') || 'Win' },
    { value: 'LOSS' as StatusFilter, label: t('common.loss') || 'Loss' },
    { value: 'BE' as StatusFilter, label: t('common.breakeven') || 'BE' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('journal.title') || 'Nemesis Trading Journal'}
          </h1>
          <p className="text-muted-foreground">
            {t('journal.manageTrades') || 'Manage your trades'}
          </p>
        </div>
        <Button onClick={() => navigate('/journal/new')}>
          <Plus className="h-4 w-4 mr-2" />
          {t('journal.newTrade') || 'New Trade'}
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Search Filter */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground min-w-[60px]">
            Search:
          </span>
          <Input
            type="text"
            placeholder="Search by pair (e.g. BTC, ETH, BTCUSDT...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md h-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground min-w-[60px]">
            {t('journal.dateRange') || 'Period'}:
          </span>
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

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-4" /> {/* Spacer for alignment */}
          <span className="text-xs text-muted-foreground min-w-[60px]">
            {t('common.status') || 'Status'}:
          </span>
          <div className="flex gap-1 border rounded-lg p-1">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={statusFilter === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(option.value)}
                className="h-7 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredTrades.length} {t('journal.trades') || 'trades'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {filteredTrades.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                {trades.length === 0
                  ? 'No trades yet. Create your first trade to get started!'
                  : 'No trades match your search.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredTrades.map(trade => (
                  <div
                    key={trade.id}
                    className="flex items-center gap-4 p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/journal/${trade.id}`)}
                  >
                    {/* Pair */}
                    <div className="font-semibold min-w-[120px]">
                      {trade.pair}
                    </div>

                    {/* Exchange */}
                    <div className="text-sm text-muted-foreground min-w-[100px]">
                      {trade.exchange}
                    </div>

                    {/* Date */}
                    <div className="text-sm text-muted-foreground min-w-[100px]">
                      {new Date(trade.trade_date * 1000).toLocaleDateString()}
                    </div>

                    {/* Status */}
                    <div className="min-w-[80px]">
                      <Badge variant={
                        trade.status === 'WIN' ? 'default' :
                        trade.status === 'LOSS' ? 'destructive' :
                        trade.status === 'BE' ? 'secondary' :
                        'outline'
                      } className="text-xs">
                        {trade.status}
                      </Badge>
                    </div>

                    {/* P&L */}
                    <div className={`font-semibold min-w-[120px] text-right ml-auto ${
                      trade.total_pnl
                        ? (trade.total_pnl >= 0 ? 'text-success' : 'text-destructive')
                        : 'text-muted-foreground'
                    }`}>
                      {trade.total_pnl ? formatCurrency(trade.total_pnl) : '-'}
                    </div>

                    {/* View Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/journal/${trade.id}`);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
