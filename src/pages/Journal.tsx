import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Trade } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { formatRR, getDateRangeTimestamp, type DateRange } from '../lib/utils';
import { calculateExecutionMetrics } from '../lib/calculations';
import { Plus, Eye, Calendar, Search, Trash2 } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { TrashDialog } from '../components/TrashDialog';
import { CurrencyDisplay } from '../components/CurrencyDisplay';
import { AnonymousToggle } from '../components/AnonymousToggle';

type StatusFilter = 'all' | 'OPEN' | 'WIN' | 'LOSS' | 'BE';

export default function Journal() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);

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
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {t('journal.title') || 'Nemesis Trading Journal'}
            <HelpBadge section="journal" />
          </h1>
          <p className="text-muted-foreground">
            {t('journal.manageTrades') || 'Manage your trades'}
          </p>
        </div>
        <div className="flex gap-2">
          <AnonymousToggle />
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t('journal.trash') || 'Trash'}
          </Button>
          <Button onClick={() => navigate('/journal/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('journal.newTrade') || 'New Trade'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Search Filter */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground min-w-[60px]">
            {t('journal.search')}:
          </span>
          <Input
            type="text"
            placeholder={t('journal.searchPairPlaceholder')}
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
              {t('common.clear') || 'Clear'}
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
                {searchQuery
                  ? t('journal.noTradesFound')
                  : trades.length === 0
                  ? t('journal.noTradesMessage')
                  : t('journal.noTradesInFilter')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Table Header */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 border-b font-semibold text-xs text-muted-foreground">
                <div className="min-w-[120px]">{t('journal.pair') || 'Pair'}</div>
                <div className="min-w-[100px]">{t('journal.exchange') || 'Exchange'}</div>
                <div className="min-w-[100px]">{t('journal.date') || 'Date'}</div>
                <div className="min-w-[60px]">{t('journal.type') || 'Type'}</div>
                <div className="min-w-[80px]">{t('common.status') || 'Status'}</div>
                <div className="min-w-[80px] text-right">{t('journal.effectiveRR') || 'R:R'}</div>
                <div className="min-w-[100px] text-right">{t('journal.pnlInR') || 'P&L (R)'}</div>
                <div className="min-w-[120px] text-right">{t('journal.realizedPnl') || 'Realized P&L'}</div>
                <div className="min-w-[120px] text-right ml-auto">{t('journal.pnl') || 'Total P&L'}</div>
                <div className="w-10">{/* View button */}</div>
              </div>

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

                    {/* Type (LONG/SHORT) */}
                    <div className="min-w-[60px]">
                      <Badge variant={trade.position_type === 'LONG' ? 'default' : 'secondary'} className="text-xs">
                        {trade.position_type}
                      </Badge>
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

                    {/* Effective R:R (calculated live) */}
                    {(() => {
                      let effectiveRR = null;

                      if (trade.status !== 'OPEN' && trade.exits) {
                        try {
                          const exits = typeof trade.exits === 'string' ? JSON.parse(trade.exits) : trade.exits;

                          // Validate parsed exits is an array
                          if (!Array.isArray(exits)) {
                            throw new Error('Exits is not an array');
                          }

                          const validExits = exits.filter((e: any) => e?.price > 0);

                          if (validExits.length > 0) {
                            const totalExitPercent = validExits.reduce((sum: number, e: any) => sum + e.percent, 0);

                            if (totalExitPercent > 0) {
                              const normalizedExits = validExits.map((e: any) => ({
                                price: e.price,
                                percent: e.percent / 100,
                              }));

                              // Parse effective entries if available
                              let entriesForCalc = undefined;
                              if (trade.effective_entries) {
                                const effectiveEntries = typeof trade.effective_entries === 'string'
                                  ? JSON.parse(trade.effective_entries)
                                  : trade.effective_entries;

                                // Validate parsed entries is an array
                                if (Array.isArray(effectiveEntries)) {
                                  const validEntries = effectiveEntries.filter((e: any) => e?.price > 0);
                                  if (validEntries.length > 0) {
                                    entriesForCalc = validEntries;
                                  }
                                }
                              }

                              const metrics = calculateExecutionMetrics({
                                entries: entriesForCalc,
                                pe: entriesForCalc ? undefined : trade.effective_pe || trade.planned_pe,
                                sl: trade.planned_sl,
                                exits: normalizedExits,
                                oneR: trade.one_r,
                                positionSize: trade.position_size,
                                type: trade.position_type,
                              });

                              effectiveRR = metrics.effectiveRR;
                            }
                          }
                        } catch (error) {
                          console.error('Failed to calculate effective RR for trade:', trade.id, error);
                          effectiveRR = null; // Explicitly set to null on error
                        }
                      }

                      return (
                        <div className="text-sm text-muted-foreground min-w-[80px] text-right">
                          {effectiveRR !== null ? formatRR(effectiveRR) : '-'}
                        </div>
                      );
                    })()}

                    {/* P&L in R (calculated live) */}
                    {(() => {
                      // For BE trades, show 0 even if total_pnl is null
                      let pnlInR = null;
                      if (trade.status === 'BE') {
                        pnlInR = 0;
                      } else if (trade.status !== 'OPEN' && trade.total_pnl != null && trade.one_r > 0) {
                        pnlInR = trade.total_pnl / trade.one_r;
                      }

                      return (
                        <div className={`font-semibold min-w-[100px] text-right ${
                          pnlInR !== null
                            ? (pnlInR > 0 ? 'text-success' : pnlInR < 0 ? 'text-destructive' : 'text-muted-foreground')
                            : 'text-muted-foreground'
                        }`}>
                          {pnlInR !== null
                            ? `${pnlInR > 0 ? '+' : ''}${pnlInR.toFixed(2)}R`
                            : '-'}
                        </div>
                      );
                    })()}

                    {/* Realized P&L (shows partial exit PnL even for OPEN trades) */}
                    {(() => {
                      let realizedPnl = null;

                      if (trade.status === 'BE') {
                        realizedPnl = 0;
                      } else if (trade.exits) {
                        try {
                          const exits = typeof trade.exits === 'string' ? JSON.parse(trade.exits) : trade.exits;

                          if (Array.isArray(exits)) {
                            const validExits = exits.filter((e: any) => e?.price > 0);

                            if (validExits.length > 0) {
                              const normalizedExits = validExits.map((e: any) => ({
                                price: e.price,
                                percent: e.percent / 100,
                              }));

                              // Parse effective entries if available
                              let entriesForCalc = undefined;
                              if (trade.effective_entries) {
                                const effectiveEntries = typeof trade.effective_entries === 'string'
                                  ? JSON.parse(trade.effective_entries)
                                  : trade.effective_entries;

                                if (Array.isArray(effectiveEntries)) {
                                  const validEntries = effectiveEntries.filter((e: any) => e?.price > 0);
                                  if (validEntries.length > 0) {
                                    entriesForCalc = validEntries;
                                  }
                                }
                              }

                              const metrics = calculateExecutionMetrics({
                                entries: entriesForCalc,
                                pe: entriesForCalc ? undefined : trade.effective_pe || trade.planned_pe,
                                sl: trade.planned_sl,
                                exits: normalizedExits,
                                oneR: trade.one_r,
                                positionSize: trade.position_size,
                                type: trade.position_type,
                              });

                              realizedPnl = metrics.realizedPnl;
                            }
                          }
                        } catch (error) {
                          console.error('Failed to calculate realized PnL for trade:', trade.id, error);
                          realizedPnl = null;
                        }
                      }

                      return (
                        <div className={`font-semibold min-w-[120px] text-right ${
                          realizedPnl !== null
                            ? (realizedPnl > 0 ? 'text-success' : realizedPnl < 0 ? 'text-destructive' : 'text-muted-foreground')
                            : 'text-muted-foreground'
                        }`}>
                          {realizedPnl !== null ? <CurrencyDisplay value={realizedPnl} /> : '-'}
                        </div>
                      );
                    })()}

                    {/* Total P&L (only for fully closed trades) */}
                    <div className={`font-semibold min-w-[120px] text-right ml-auto ${
                      (trade.total_pnl != null || trade.status === 'BE')
                        ? ((trade.total_pnl ?? 0) > 0 ? 'text-success' : (trade.total_pnl ?? 0) < 0 ? 'text-destructive' : 'text-muted-foreground')
                        : 'text-muted-foreground'
                    }`}>
                      {(trade.total_pnl != null || trade.status === 'BE') ? <CurrencyDisplay value={trade.total_pnl ?? 0} /> : '-'}
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

      {/* Trash Dialog */}
      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onTradeRestored={loadTrades}
      />
    </div>
  );
}
