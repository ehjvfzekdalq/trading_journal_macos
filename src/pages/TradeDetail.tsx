import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { api, type Trade } from '../lib/api';
import { calculateExecutionMetrics, calculateWeightedEntry, calculateTradeMetrics } from '../lib/calculations';
import { formatCurrency, formatRR, formatPercent, cn } from '../lib/utils';
import { ArrowLeft, Copy, Trash2, AlertCircle, TrendingUp, TrendingDown, Calendar, Plus, X, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { useEntryManager } from '../hooks/useEntryManager';
import { WeightedEntryDisplay } from '../components/WeightedEntryDisplay';
import { PositionMetricsEditor } from '../components/PositionMetricsEditor';
import { Switch } from '../components/ui/switch';
import { TradeSetupVisualizer } from '../components/TradeSetupVisualizer';

type Exit = {
  price: number;
  percent: number;
};

export default function TradeDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trade, setTrade] = useState<Trade | null>(null);

  // Collapsible section states (collapsed by default on mobile)
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(true);
  const [isExecutionCollapsed, setIsExecutionCollapsed] = useState(true);

  // Editable dates
  const [analysisDate, setAnalysisDate] = useState('');
  const [tradeDate, setTradeDate] = useState('');

  // Entry states (using custom hooks)
  const plannedEntriesManager = useEntryManager([]);
  const {
    entries: plannedEntries,
    setEntries: setPlannedEntries,
    add: addPlannedEntry,
    remove: removePlannedEntry,
    update: updatePlannedEntry
  } = plannedEntriesManager;

  const effectiveEntriesManager = useEntryManager([]);
  const {
    entries: effectiveEntries,
    setEntries: setEffectiveEntries,
    add: addEffectiveEntry,
    remove: removeEffectiveEntry,
    update: updateEffectiveEntry
  } = effectiveEntriesManager;

  // Editable basic fields
  const [pair, setPair] = useState('');
  const [exchange, setExchange] = useState('');

  // Editable plan fields
  const [plannedSl, setPlannedSl] = useState(0);
  const [leverage, setLeverage] = useState(10);
  const [plannedTps, setPlannedTps] = useState<Array<{price: number, percent: number}>>([]);

  // Planned position metrics (optional overrides - stored in local state only)
  const [plannedMarginOverride, setPlannedMarginOverride] = useState<number | null>(null);
  const [plannedPositionSizeOverride, setPlannedPositionSizeOverride] = useState<number | null>(null);
  const [plannedQuantityOverride, setPlannedQuantityOverride] = useState<number | null>(null);
  const [plannedOneROverride, setPlannedOneROverride] = useState<number | null>(null);

  // Editable execution fields
  const [effectivePe, setEffectivePe] = useState(0);
  const [exits, setExits] = useState<Exit[]>([]);
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  // Execution calculations (optional R redefinition)
  const [useExecutionR, setUseExecutionR] = useState(false);
  const [executionPortfolio, setExecutionPortfolio] = useState(0);
  const [executionRPercent, setExecutionRPercent] = useState(0);

  // Execution position metrics
  const [executionMargin, setExecutionMargin] = useState(0);
  const [executionPositionSize, setExecutionPositionSize] = useState(0);
  const [executionQuantity, setExecutionQuantity] = useState(0);
  const [executionOneR, setExecutionOneR] = useState(0);

  // Calculate current metrics (memoized) - must be before early returns
  const { executionMetrics, executionValid, validExits, totalExitPercent } = useMemo(() => {
    // Handle null trade case safely
    if (!trade) {
      return {
        executionMetrics: null,
        executionValid: false,
        validExits: [],
        totalExitPercent: 0
      };
    }

    const validExits = exits.filter(e => e.price > 0);
    const totalExitPercent = validExits.reduce((sum, e) => sum + e.percent, 0);
    let executionMetrics = null;
    let executionValid = false;

    if (validExits.length > 0 && totalExitPercent > 0) {
      const normalizedExits = validExits.map(e => ({
        price: e.price,
        percent: e.percent / 100,
      }));

      // Use effective entries if available (multi-PE), otherwise fall back to single PE
      const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
      const entriesForCalc = validEffectiveEntries.length > 0 ? validEffectiveEntries : undefined;

      try {
        executionMetrics = calculateExecutionMetrics({
          entries: entriesForCalc,
          pe: entriesForCalc ? undefined : effectivePe,
          sl: trade.planned_sl,
          exits: normalizedExits,
          oneR: trade.one_r,
          positionSize: trade.position_size,
          type: trade.position_type,
        });

        executionValid = true;
      } catch (error) {
        console.error('Failed to calculate execution metrics for display:', error);
        // executionMetrics remains null, executionValid remains false
      }
    }

    return { executionMetrics, executionValid, validExits, totalExitPercent };
  }, [trade, exits, effectiveEntries, effectivePe]);

  // Calculate execution R calculations
  const executionCalculations = useMemo(() => {
    if (!trade || !useExecutionR || !executionPortfolio || !executionRPercent) return null;

    const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
    if (validEffectiveEntries.length === 0) return null;

    // Normalize entries to 0-1 scale
    const totalPercent = validEffectiveEntries.reduce((sum, e) => sum + e.percent, 0);
    const normalizedEntries = validEffectiveEntries.map(e => ({
      price: e.price,
      percent: e.percent / totalPercent
    }));

    // Get exits (or fall back to planned TPs)
    const validExits = exits.filter(e => e.price > 0);
    const normalizedExits = validExits.length > 0
      ? validExits.map(e => ({ price: e.price, percent: e.percent / 100 }))
      : plannedTps.filter(tp => tp.price > 0);

    try {
      return calculateTradeMetrics({
        portfolio: executionPortfolio,
        rPercent: executionRPercent / 100,
        entries: normalizedEntries,
        sl: plannedSl,
        tps: normalizedExits,
        leverage: leverage,
      });
    } catch (error) {
      console.error('Failed to calculate execution metrics:', error);
      return null;
    }
  }, [useExecutionR, executionPortfolio, executionRPercent, effectiveEntries, exits, plannedTps, plannedSl, leverage, trade]);

  // Calculate effective planned metrics (use overrides if set, otherwise use calculated values)
  const effectivePlannedMetrics = useMemo(() => {
    if (!trade) {
      return {
        margin: 0,
        positionSize: 0,
        quantity: 0,
        oneR: 0,
      };
    }
    return {
      margin: plannedMarginOverride ?? trade.margin,
      positionSize: plannedPositionSizeOverride ?? trade.position_size,
      quantity: plannedQuantityOverride ?? trade.quantity,
      oneR: plannedOneROverride ?? trade.one_r,
    };
  }, [plannedMarginOverride, plannedPositionSizeOverride, plannedQuantityOverride, plannedOneROverride, trade]);

  useEffect(() => {
    if (id) {
      loadTrade(id);
    }
  }, [id]);

  const loadTrade = async (tradeId: string) => {
    try {
      const data = await api.getTrade(tradeId);
      setTrade(data);

      // Initialize basic fields
      setPair(data.pair);
      setExchange(data.exchange);

      // Initialize dates
      setAnalysisDate(new Date(data.analysis_date * 1000).toISOString().split('T')[0]);
      setTradeDate(new Date(data.trade_date * 1000).toISOString().split('T')[0]);

      // Parse planned entries
      if (data.planned_entries) {
        try {
          const parsed = typeof data.planned_entries === 'string'
            ? JSON.parse(data.planned_entries)
            : data.planned_entries;
          setPlannedEntries(parsed);
        } catch {
          // Fallback to single entry
          setPlannedEntries([{ price: data.planned_pe, percent: 100 }]);
        }
      } else {
        // Backward compat: derive from planned_pe
        setPlannedEntries([{ price: data.planned_pe, percent: 100 }]);
      }

      // Parse effective entries
      if (data.effective_entries) {
        try {
          const parsed = typeof data.effective_entries === 'string'
            ? JSON.parse(data.effective_entries)
            : data.effective_entries;
          setEffectiveEntries(parsed);
        } catch {
          setEffectiveEntries([{ price: data.effective_pe || 0, percent: 100 }]);
        }
      } else if (data.effective_pe) {
        setEffectiveEntries([{ price: data.effective_pe, percent: 100 }]);
      } else {
        setEffectiveEntries([{ price: 0, percent: 0 }]);
      }

      // Initialize plan fields
      setPlannedSl(data.planned_sl);
      setLeverage(data.leverage);

      // Parse planned TPs
      try {
        const parsedPlannedTps = typeof data.planned_tps === 'string'
          ? JSON.parse(data.planned_tps)
          : data.planned_tps;
        setPlannedTps(parsedPlannedTps);
      } catch (e) {
        console.error('Failed to parse planned_tps:', e);
        setPlannedTps([]);
      }

      // Initialize execution fields
      setEffectivePe(data.effective_pe || data.planned_pe);

      if (data.exits) {
        try {
          const parsedExits = typeof data.exits === 'string'
            ? JSON.parse(data.exits)
            : data.exits;
          setExits(parsedExits.length > 0 ? parsedExits : [{ price: 0, percent: 0 }]);
        } catch {
          setExits([{ price: 0, percent: 0 }]);
        }
      } else {
        // Initialize with one empty exit
        setExits([{ price: 0, percent: 0 }]);
      }

      if (data.close_date) {
        setCloseDate(new Date(data.close_date * 1000).toISOString().split('T')[0]);
      }

      setNotes(data.notes || '');

      // Initialize execution R fields
      setUseExecutionR(!!data.execution_portfolio && !!data.execution_r_percent);
      setExecutionPortfolio(data.execution_portfolio || data.portfolio_value);
      setExecutionRPercent(data.execution_r_percent ? data.execution_r_percent * 100 : data.r_percent * 100);

      // Initialize execution position metrics
      setExecutionMargin(data.execution_margin || data.margin);
      setExecutionPositionSize(data.execution_position_size || data.position_size);
      setExecutionQuantity(data.execution_quantity || data.quantity);
      setExecutionOneR(data.execution_one_r || data.one_r);
    } catch (error) {
      console.error('Failed to load trade:', error);
      toast.error(t('tradeDetail.failedToLoad'));
      navigate('/journal');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!trade) return;

    setSaving(true);
    try {
      // Calculate execution metrics
      let totalPnl = null;
      let effectiveRR = null;
      let newStatus = trade.status;

      const validExits = exits.filter(e => e.price > 0);

      if (validExits.length === 0) {
        // No exits - reset to OPEN status and clear P&L
        newStatus = 'OPEN';
        totalPnl = null;
        effectiveRR = null;
      } else if (validExits.length > 0) {
        const totalExitPercent = validExits.reduce((sum, e) => sum + e.percent, 0);

        if (Math.abs(totalExitPercent - 100) <= 0.1) {
          // All position closed
          const normalizedExits = validExits.map(e => ({
            price: e.price,
            percent: e.percent / totalExitPercent,
          }));

          // Use effective entries if available, otherwise fall back to single PE
          const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
          const entriesForCalc = validEffectiveEntries.length > 0 ? validEffectiveEntries : undefined;

          let metrics;
          try {
            metrics = calculateExecutionMetrics({
              entries: entriesForCalc,
              pe: entriesForCalc ? undefined : effectivePe,
              sl: trade.planned_sl,
              exits: normalizedExits,
              oneR: trade.one_r,
              positionSize: trade.position_size,
              type: trade.position_type,
            });

            totalPnl = metrics.totalPnl;
            effectiveRR = metrics.effectiveRR;

            // Determine status based on P&L
            if (Math.abs(metrics.totalPnl) < 0.5) {
              // P&L is near zero - this is break-even
              newStatus = 'BE';
            } else if (metrics.totalPnl > 0) {
              newStatus = 'WIN';
            } else {
              newStatus = 'LOSS';
            }
          } catch (error) {
            console.error('Failed to calculate execution metrics:', error);
            toast.error('Failed to calculate execution metrics. Please check your entry and exit configuration.');
            setSaving(false);
            return;
          }
        } else if (totalExitPercent > 0) {
          // Partial exit
          const normalizedExits = validExits.map(e => ({
            price: e.price,
            percent: e.percent / 100,
          }));

          // Use effective entries if available, otherwise fall back to single PE
          const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
          const entriesForCalc = validEffectiveEntries.length > 0 ? validEffectiveEntries : undefined;

          try {
            const metrics = calculateExecutionMetrics({
              entries: entriesForCalc,
              pe: entriesForCalc ? undefined : effectivePe,
              sl: trade.planned_sl,
              exits: normalizedExits,
              oneR: trade.one_r,
              positionSize: trade.position_size,
              type: trade.position_type,
            });

            effectiveRR = metrics.effectiveRR;
            newStatus = 'OPEN';
          } catch (error) {
            console.error('Failed to calculate execution metrics for partial exit:', error);
            toast.error('Failed to calculate execution metrics. Please check your entry and exit configuration.');
            setSaving(false);
            return;
          }
        }
      }

      const exitsJson = JSON.stringify(validExits);
      const closeDateTimestamp = closeDate ? Math.floor(new Date(closeDate).getTime() / 1000) : null;

      // Prepare planned entries
      const validPlannedEntries = plannedEntries.filter(e => e.price > 0);
      const plannedEntriesJson = validPlannedEntries.length > 0
        ? JSON.stringify(validPlannedEntries)
        : undefined;

      // Calculate weighted planned PE
      let weightedPlannedPE = trade.planned_pe;
      if (validPlannedEntries.length > 0) {
        try {
          weightedPlannedPE = calculateWeightedEntry(validPlannedEntries);
        } catch (error) {
          console.error('Failed to calculate weighted planned PE:', error);
          toast.error('Invalid planned entry configuration. Please check your entry allocations.');
          setSaving(false);
          return;
        }
      }

      // Prepare planned TPs
      const plannedTpsJson = JSON.stringify(plannedTps);

      // Prepare effective entries
      const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
      const effectiveEntriesJson = validEffectiveEntries.length > 0
        ? JSON.stringify(validEffectiveEntries)
        : undefined;

      // Calculate weighted effective PE
      let weightedEffectivePE = effectivePe;
      if (validEffectiveEntries.length > 0) {
        try {
          weightedEffectivePE = calculateWeightedEntry(validEffectiveEntries);
        } catch (error) {
          console.error('Failed to calculate weighted effective PE:', error);
          toast.error('Invalid effective entry configuration. Please check your filled entry allocations.');
          setSaving(false);
          return;
        }
      }

      // Calculate P&L in R multiples
      const pnlInR = totalPnl !== null && trade.one_r > 0
        ? totalPnl / trade.one_r
        : null;

      // Prepare execution calculation fields
      const executionFields = useExecutionR && executionCalculations ? {
        execution_portfolio: executionPortfolio,
        execution_r_percent: executionRPercent / 100,
        execution_margin: executionMargin,
        execution_position_size: executionPositionSize,
        execution_quantity: executionQuantity,
        execution_one_r: executionOneR,
        execution_potential_profit: executionCalculations.potentialProfit,
      } : {
        execution_portfolio: undefined,
        execution_r_percent: undefined,
        execution_margin: executionMargin !== trade.margin ? executionMargin : undefined,
        execution_position_size: executionPositionSize !== trade.position_size ? executionPositionSize : undefined,
        execution_quantity: executionQuantity !== trade.quantity ? executionQuantity : undefined,
        execution_one_r: executionOneR !== trade.one_r ? executionOneR : undefined,
        execution_potential_profit: undefined,
      };

      // Parse dates to timestamps
      const analysisDateTimestamp = analysisDate ? Math.floor(new Date(analysisDate).getTime() / 1000) : trade.analysis_date;
      const tradeDateTimestamp = tradeDate ? Math.floor(new Date(tradeDate).getTime() / 1000) : trade.trade_date;

      await api.updateTrade(trade.id, {
        // Basic fields
        pair: pair.toUpperCase(),
        exchange: exchange,
        analysis_date: analysisDateTimestamp,
        trade_date: tradeDateTimestamp,
        // Plan fields
        planned_pe: weightedPlannedPE,
        planned_sl: plannedSl,
        leverage: leverage,
        planned_tps: plannedTpsJson,
        planned_entries: plannedEntriesJson,
        // Execution fields
        effective_pe: weightedEffectivePE,
        effective_entries: effectiveEntriesJson,
        exits: exitsJson,
        close_date: closeDateTimestamp ?? undefined,
        total_pnl: totalPnl ?? undefined,
        pnl_in_r: pnlInR ?? undefined,
        effective_weighted_rr: effectiveRR ?? undefined,
        status: newStatus,
        notes: notes,
        ...executionFields,
      });

      toast.success(t('tradeDetail.tradeUpdated'));
      navigate('/journal');
    } catch (error) {
      console.error('Failed to update trade:', error);
      toast.error(t('tradeDetail.failedToUpdate') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!trade) return;

    toast.promise(
      async () => {
        const newTrade = await api.duplicateTrade(trade.id);
        navigate(`/journal/${newTrade.id}`);
        return newTrade;
      },
      {
        loading: t('tradeDetail.duplicating') || 'Duplicating trade...',
        success: t('tradeDetail.tradeDuplicated'),
        error: (error) => t('tradeDetail.failedToDuplicate') + ': ' + error,
      }
    );
  };

  const handleDelete = async () => {
    if (!trade) return;

    toast.promise(
      async () => {
        await api.deleteTrade(trade.id);
        navigate('/journal');
      },
      {
        loading: t('tradeDetail.deleting') || 'Deleting trade...',
        success: t('tradeDetail.tradeDeleted'),
        error: (error) => t('tradeDetail.failedToDelete') + ': ' + error,
      }
    );
  };

  const handleCopyPlanToExecution = () => {
    if (!trade) return;

    // Copy planned entry to actual entry
    setEffectivePe(trade.planned_pe);

    // Copy planned entries to effective entries
    const copiedEntries = plannedEntries.map(e => ({
      price: e.price,
      percent: e.percent
    }));
    setEffectiveEntries(copiedEntries);

    // Copy planned TPs to exits
    const copiedExits = plannedTps.map((tp: any) => ({
      price: tp.price,
      percent: tp.percent
    }));
    setExits(copiedExits);
  };

  if (loading) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>;
  }

  if (!trade) {
    return <div className="text-destructive">{t('tradeDetail.notFound')}</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header - Responsive Design */}
      <div className="space-y-3">
        {/* Mobile: Stacked layout */}
        <div className="flex flex-col gap-3 md:hidden">
          {/* Row 1: Back button, badges, and action buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/journal')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <HelpBadge section="journal" />
              <Badge variant={
                trade.position_type === 'LONG' ? 'default' : 'destructive'
              } className="text-xs px-2 py-0.5">
                {trade.position_type}
              </Badge>
              <Badge variant={
                trade.status === 'WIN' ? 'default' :
                trade.status === 'LOSS' ? 'destructive' :
                trade.status === 'BE' ? 'secondary' :
                'outline'
              } className="text-xs px-2 py-0.5">
                {trade.status}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={handleDuplicate} className="h-8 w-8 p-0">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="h-8 w-8 p-0">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Row 2: Pair and Exchange inputs */}
          <div className="flex items-center gap-2">
            <input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              placeholder={t('tradeNew.pairPlaceholder')}
              className="text-lg font-bold bg-transparent border-b border-border focus:border-primary outline-none px-1 flex-1 min-w-0"
            />
            <span className="text-muted-foreground text-sm shrink-0">on</span>
            <input
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              placeholder={t('tradeNew.exchangePlaceholder')}
              className="text-sm bg-transparent border-b border-border focus:border-primary outline-none px-1 flex-1 min-w-0"
            />
          </div>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <HelpBadge section="journal" />
            <Badge variant={
              trade.position_type === 'LONG' ? 'default' : 'destructive'
            } className="text-sm px-3 py-1">
              {trade.position_type}
            </Badge>
            <Badge variant={
              trade.status === 'WIN' ? 'default' :
              trade.status === 'LOSS' ? 'destructive' :
              trade.status === 'BE' ? 'secondary' :
              'outline'
            } className="text-sm px-3 py-1">
              {trade.status}
            </Badge>
            <div className="h-6 w-px bg-border" />
            <input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              placeholder={t('tradeNew.pairPlaceholder')}
              className="text-xl font-bold bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-0 w-auto min-w-[100px] placeholder:text-muted-foreground/40"
              style={{ width: `${Math.max(pair.length * 12 + 20, 100)}px` }}
            />
            <span className="text-muted-foreground text-sm">on</span>
            <input
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              placeholder={t('tradeNew.exchangePlaceholder')}
              className="text-lg bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-0 w-auto min-w-[80px] placeholder:text-muted-foreground/40"
              style={{ width: `${Math.max(exchange.length * 10 + 20, 80)}px` }}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              {t('tradeDetail.duplicate')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('tradeDetail.delete')}
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid gap-3 grid-cols-3 md:gap-4">
        {/* Risk 1R Card */}
        <Card>
          <CardContent className="pt-4 pb-4 px-3 md:pt-6 md:px-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground font-semibold">Risk 1R</p>
                <p className="text-lg md:text-2xl font-bold">{formatCurrency(trade.one_r)}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground">{formatPercent(trade.r_percent)}</p>
              </div>
              <AlertCircle className="h-5 w-5 md:h-8 md:w-8 text-muted-foreground hidden md:block" />
            </div>
          </CardContent>
        </Card>

        {/* Plan Card */}
        <Card>
          <CardContent className="pt-4 pb-4 px-3 md:pt-6 md:px-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground font-semibold">Plan</p>
                <p className="text-lg md:text-2xl font-bold">{formatRR(trade.planned_weighted_rr)}</p>
                <p className="text-[10px] md:text-xs text-success font-semibold">
                  {formatCurrency(trade.one_r * trade.planned_weighted_rr)}
                </p>
              </div>
              <TrendingUp className="h-5 w-5 md:h-8 md:w-8 text-success hidden md:block" />
            </div>
          </CardContent>
        </Card>

        {/* Execution Card - Only show if trade has execution data */}
        {(trade.total_pnl !== null || trade.effective_weighted_rr !== null) && (
          <Card>
            <CardContent className="pt-4 pb-4 px-3 md:pt-6 md:px-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="text-[10px] md:text-xs text-muted-foreground font-semibold">Execution</p>
                  <p className="text-lg md:text-2xl font-bold">
                    {trade.effective_weighted_rr ? formatRR(trade.effective_weighted_rr) : '-'}
                  </p>
                  <p className={`text-[10px] md:text-xs font-semibold ${
                    trade.total_pnl
                      ? (trade.total_pnl >= 0 ? 'text-success' : 'text-destructive')
                      : 'text-muted-foreground'
                  }`}>
                    {trade.total_pnl ? formatCurrency(trade.total_pnl) : '-'}
                  </p>
                </div>
                {trade.total_pnl !== null && (trade.total_pnl >= 0 ?
                  <TrendingUp className="h-5 w-5 md:h-8 md:w-8 text-success hidden md:block" /> :
                  <TrendingDown className="h-5 w-5 md:h-8 md:w-8 text-destructive hidden md:block" />
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Trade Results */}
      {executionValid && executionMetrics && (
        <Card className="border-2 border-primary">
          <CardHeader className="bg-primary/10 pb-2 md:pb-3">
            <CardTitle className="text-sm md:text-base">{t('tradeDetail.tradeResults') || 'Résultats du trade'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 md:pt-4 space-y-3">
            {/* Row 1: P&L and RR */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {/* P&L Realized */}
              <div className="flex flex-col items-center justify-center p-2 md:p-3 bg-muted/50 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.realizedPnL')}</div>
                <div className={`text-lg md:text-2xl font-bold ${
                  executionMetrics.realizedPnl >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {formatCurrency(executionMetrics.realizedPnl)}
                </div>
              </div>

              {/* Effective RR */}
              <div className="flex flex-col items-center justify-center p-2 md:p-3 bg-muted/50 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.effectiveRR')}</div>
                <div className="text-lg md:text-2xl font-bold">{formatRR(executionMetrics.effectiveRR)}</div>
              </div>
            </div>

            {/* Row 2: PE(s), SL, TP(s) - Condensed View */}
            <div className="grid grid-cols-3 gap-2 md:gap-3 text-xs">
              {/* PE(s) */}
              <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                <div className="text-[10px] text-muted-foreground mb-1">PE(s)</div>
                <div className="font-mono text-[10px] md:text-xs">
                  {plannedEntries.filter(e => e.price > 0).map((e, i) => (
                    <div key={i}>{parseFloat(e.price.toFixed(8))}</div>
                  ))}
                </div>
              </div>

              {/* SL */}
              <div className="flex flex-col items-center justify-center p-2 bg-destructive/10 rounded">
                <div className="text-[10px] text-muted-foreground mb-1">SL</div>
                <div className="font-mono text-[10px] md:text-xs text-destructive font-semibold">
                  {parseFloat(plannedSl.toFixed(8))}
                </div>
              </div>

              {/* TP(s) */}
              <div className="flex flex-col items-center justify-center p-2 bg-success/10 rounded">
                <div className="text-[10px] text-muted-foreground mb-1">TP(s)</div>
                <div className="font-mono text-[10px] md:text-xs text-success">
                  {plannedTps.filter(tp => tp.price > 0).map((tp, i) => (
                    <div key={i}>{parseFloat(tp.price.toFixed(8))}</div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stacked Layout */}
      <div className="grid gap-6">
        {/* Trade Plan (Editable) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t('tradeDetail.tradePlan')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlanCollapsed(!isPlanCollapsed)}
                  className="md:hidden"
                >
                  {isPlanCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-4 pt-6", isPlanCollapsed && "hidden md:block")}>
              {/* Dates - Editable */}
              <div className="border-2 border-white rounded-lg p-4">
                <div className="text-sm font-semibold mb-3">{t('tradeDetail.dates')}</div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="analysisDate" className="text-xs">{t('tradeDetail.analysisDate')}</Label>
                    <Input
                      id="analysisDate"
                      type="date"
                      value={analysisDate}
                      onChange={(e) => setAnalysisDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradeDate" className="text-xs">{t('tradeDetail.tradeDate')}</Label>
                    <Input
                      id="tradeDate"
                      type="date"
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Position Metrics Editor - Plan Section */}
              <div className="border-2 border-white rounded-lg p-4">
                <PositionMetricsEditor
                  entryPrice={(() => {
                    const validEntries = plannedEntries.filter(e => e.price > 0 && e.percent > 0);
                    if (validEntries.length > 1) {
                      try {
                        return calculateWeightedEntry(validEntries);
                      } catch {
                        return trade.planned_pe;
                      }
                    }
                    return validEntries[0]?.price || trade.planned_pe;
                  })()}
                  stopLoss={plannedSl}
                  leverage={leverage}
                  positionType={trade.position_type as 'LONG' | 'SHORT'}
                  initialMargin={effectivePlannedMetrics.margin}
                  initialPositionSize={effectivePlannedMetrics.positionSize}
                  initialQuantity={effectivePlannedMetrics.quantity}
                  initialOneR={effectivePlannedMetrics.oneR}
                  onChange={(metrics) => {
                    setPlannedMarginOverride(metrics.margin);
                    setPlannedPositionSizeOverride(metrics.positionSize);
                    setPlannedQuantityOverride(metrics.quantity);
                    setPlannedOneROverride(metrics.oneR);
                  }}
                  label={t('positionMetrics.title')}
                />
              </div>

              {/* Planned Entries (Multi-PE) - Editable */}
              <div className="border-2 border-white rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('tradeDetail.plannedEntries')}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPlannedEntry}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('tradeNew.addEntry') || 'Add Entry'}
                  </Button>
                </div>

                {plannedEntries.map((entry, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Entry {index + 1}</Badge>
                      {plannedEntries.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePlannedEntry(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-3 grid-cols-2">
                      <div>
                        <Label htmlFor={`planned-entry${index}-price`} className="text-xs">
                          {t('calculator.entryShort')} {index === 0 && '*'}
                        </Label>
                        <Input
                          id={`planned-entry${index}-price`}
                          type="number"
                          step="0.00000001"
                          value={entry.price || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') updatePlannedEntry(index, 'price', v || 0);
                          }}
                          placeholder="0.00"
                          className="font-mono text-sm"
                          required={index === 0}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`planned-entry${index}-percent`} className="text-xs">
                          {t('tradeNew.allocationPercent')}
                        </Label>
                        <Input
                          id={`planned-entry${index}-percent`}
                          type="number"
                          min="0"
                          max="100"
                          value={entry.percent || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') updatePlannedEntry(index, 'percent', v || 0);
                          }}
                          disabled={!entry.price}
                          placeholder="0"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Weighted Average (only show if multiple entries) */}
                <WeightedEntryDisplay
                  entries={plannedEntries}
                  label={t('tradeDetail.weightedEntry') || 'Weighted Avg Entry'}
                />
              </div>

              {/* Stop Loss & Leverage - Editable */}
              <div className="border-2 border-destructive rounded-lg p-4">
                <div className="text-sm font-semibold text-destructive mb-3">{t('tradeDetail.stopLossAndLeverage')}</div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plannedSl" className="text-xs">{t('tradeNew.stopLossRequired')}</Label>
                  <Input
                    id="plannedSl"
                    type="number"
                    step="0.00000001"
                    value={plannedSl || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) || e.target.value === '') setPlannedSl(v || 0);
                    }}
                    className="font-mono text-sm"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leverage" className="text-xs">{t('tradeNew.leverage')}</Label>
                  <Input
                    id="leverage"
                    type="number"
                    value={leverage}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) || e.target.value === '') setLeverage(v || 0);
                    }}
                    className="text-sm"
                  />
                </div>
                </div>
              </div>

              {/* Take Profits - Editable */}
              <div className="border-2 border-success rounded-lg p-4 space-y-3">
                <div className="text-sm font-semibold text-success">{t('tradeDetail.plannedTakeProfits')}</div>
                {plannedTps.map((tp, index) => (
                  <div key={index} className="grid gap-3 grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`tp${index}-price`} className="text-xs">
                        TP{index + 1} {t('calculator.entryShort')} {index === 0 && '*'}
                      </Label>
                      <Input
                        id={`tp${index}-price`}
                        type="number"
                        step="0.00000001"
                        value={tp.price || ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) || e.target.value === '') {
                            const newTps = [...plannedTps];
                            if (index >= 0 && index < newTps.length) {
                              newTps[index].price = v || 0;
                              setPlannedTps(newTps);
                            }
                          }
                        }}
                        placeholder="0.00"
                        className="font-mono text-sm"
                        required={index === 0}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`tp${index}-percent`} className="text-xs">{t('tradeNew.allocationPercent')}</Label>
                      <Input
                        id={`tp${index}-percent`}
                        type="number"
                        min="0"
                        max="100"
                        value={tp.percent || ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) || e.target.value === '') {
                            const newTps = [...plannedTps];
                            if (index >= 0 && index < newTps.length) {
                              newTps[index].percent = v || 0;
                              setPlannedTps(newTps);
                            }
                          }
                        }}
                        disabled={!tp.price}
                        placeholder="0"
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Position Details */}
              <div className="border-2 border-white rounded-lg p-4 space-y-2">
                <div className="text-sm font-semibold mb-3">{t('calculator.position')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">{t('tradeDetail.positionSize')}</div>
                    <div className="text-sm font-semibold">{formatCurrency(trade.position_size)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">{t('tradeDetail.quantity')}</div>
                    <div className="text-sm font-semibold">{trade.quantity.toFixed(4)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">{t('tradeDetail.margin')}</div>
                    <div className="text-sm font-semibold">{formatCurrency(trade.margin)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">{t('tradeDetail.leverage')}</div>
                    <div className="text-sm font-semibold">{trade.leverage}x</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trade Execution (Editable) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t('tradeDetail.tradeExecution')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Desktop: Full button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPlanToExecution}
                    disabled={!trade}
                    className="hidden md:flex"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('tradeDetail.copyPlan')}
                  </Button>
                  {/* Mobile: Icon button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPlanToExecution}
                    disabled={!trade}
                    className="md:hidden"
                    title={t('tradeDetail.copyPlan')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {/* Mobile: Collapse toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExecutionCollapsed(!isExecutionCollapsed)}
                    className="md:hidden"
                  >
                    {isExecutionCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-4 pt-6", isExecutionCollapsed && "hidden md:block")}>
              {/* Position Metrics Editor - Execution Section */}
              <div className="border-2 border-white rounded-lg p-4">
                <PositionMetricsEditor
                  entryPrice={(() => {
                    const validEntries = effectiveEntries.filter(e => e.price > 0 && e.percent > 0);
                    if (validEntries.length > 1) {
                      try {
                        return calculateWeightedEntry(validEntries);
                      } catch {
                        return effectivePe || trade.planned_pe;
                      }
                    }
                    return validEntries[0]?.price || effectivePe || trade.planned_pe;
                  })()}
                  stopLoss={plannedSl}
                  leverage={leverage}
                  positionType={trade.position_type as 'LONG' | 'SHORT'}
                  initialMargin={executionMargin}
                  initialPositionSize={executionPositionSize}
                  initialQuantity={executionQuantity}
                  initialOneR={executionOneR}
                  onChange={(metrics) => {
                    setExecutionMargin(metrics.margin);
                    setExecutionPositionSize(metrics.positionSize);
                    setExecutionQuantity(metrics.quantity);
                    setExecutionOneR(metrics.oneR);
                  }}
                  label={t('positionMetrics.title')}
                />
              </div>

              {/* Effective Entries (Multi-PE) */}
              <div className="border-2 border-white rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('tradeDetail.effectiveEntries')}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEffectiveEntry}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('tradeNew.addEntry') || 'Add Entry'}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('tradeNew.actualEntriesHelp') || 'Enter the actual prices and percentages you filled at. Partial fills allowed.'}
                </p>

                {effectiveEntries.map((entry, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    {/* Show planned entry as reference */}
                    {plannedEntries[index]?.price > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Planned: {plannedEntries[index].percent}% @ ${plannedEntries[index].price.toFixed(8)}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Entry {index + 1}</Badge>
                      {effectiveEntries.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEffectiveEntry(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-3 grid-cols-2">
                      <div>
                        <Label htmlFor={`effective-entry${index}-price`} className="text-xs">
                          Actual Price
                        </Label>
                        <Input
                          id={`effective-entry${index}-price`}
                          type="number"
                          step="0.00000001"
                          value={entry.price || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') updateEffectiveEntry(index, 'price', v || 0);
                          }}
                          placeholder="0.00"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`effective-entry${index}-percent`} className="text-xs">
                          Filled %
                        </Label>
                        <Input
                          id={`effective-entry${index}-percent`}
                          type="number"
                          min="0"
                          max="100"
                          value={entry.percent || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') updateEffectiveEntry(index, 'percent', v || 0);
                          }}
                          disabled={!entry.price}
                          placeholder="0"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Total filled percentage indicator */}
                {(() => {
                  const totalFilled = effectiveEntries
                    .filter(e => e.price > 0)
                    .reduce((sum, e) => sum + e.percent, 0);

                  return totalFilled > 0 && (
                    <div className={cn(
                      "p-2 rounded text-xs text-center",
                      totalFilled === 100
                        ? "bg-success/10 text-success"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    )}>
                      Position Filled: {totalFilled.toFixed(1)}%
                    </div>
                  );
                })()}

                {/* Weighted Average Display for Effective Entries */}
                <WeightedEntryDisplay
                  entries={effectiveEntries}
                  label="Weighted Avg Effective Entry"
                />
              </div>

              {/* Exit Points */}
              <div className={cn(
                "border-2 rounded-lg p-4 space-y-3",
                trade.status === 'WIN' ? "border-success" :
                trade.status === 'LOSS' ? "border-destructive" :
                "border-white"
              )}>
                <div className="flex items-center justify-between">
                  <Label className={cn(
                    "text-sm font-semibold",
                    trade.status === 'WIN' ? "text-success" :
                    trade.status === 'LOSS' ? "text-destructive" :
                    ""
                  )}>{t('tradeNew.actualExits')}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExits([...exits, { price: 0, percent: 0 }])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('tradeNew.addExit') || 'Ajouter Sortie'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('tradeDetail.exits')}
                </p>

                {exits.map((exit, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                    {/* Planned Setup - Mobile: separate row, show all TPs */}
                    {index === 0 && plannedTps.length > 0 && (
                      <div className="text-xs text-muted-foreground md:hidden space-y-1">
                        <div className="font-semibold">{t('tradeNew.plannedSetup')}:</div>
                        {plannedTps.filter(tp => tp.price > 0).map((tp, tpIndex) => (
                          <div key={tpIndex}>
                            TP{tpIndex + 1}: {tp.percent?.toFixed(0)}% @ ${parseFloat(tp.price?.toFixed(8))}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{t('import.exit')} {index + 1}</Badge>
                      <div className="flex items-center gap-2">
                        {/* Planned Setup - Desktop: inline, show matching TP */}
                        {plannedTps[index]?.percent != null && (
                          <span className="hidden md:inline text-xs text-muted-foreground">
                            Prévu: {plannedTps[index]?.percent?.toFixed(0)}% @ ${parseFloat(plannedTps[index]?.price?.toFixed(8))}
                          </span>
                        )}
                        {exits.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newExits = exits.filter((_, i) => i !== index);
                              setExits(newExits.length > 0 ? newExits : [{ price: 0, percent: 0 }]);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`exit${index}-price`} className="text-xs">{t('tradeDetail.exitPrice', { number: index + 1 })}</Label>
                        <Input
                          id={`exit${index}-price`}
                          type="number"
                          step="0.00000001"
                          value={exit.price || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') {
                              const newExits = [...exits];
                              if (index >= 0 && index < newExits.length) {
                                newExits[index].price = v || 0;
                                setExits(newExits);
                              }
                            }
                          }}
                          placeholder={t('tradeNew.pricePlaceholder')}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`exit${index}-percent`} className="text-xs">{t('tradeDetail.positionClosed')}</Label>
                        <Input
                          id={`exit${index}-percent`}
                          type="number"
                          min="0"
                          max="100"
                          value={exit.percent || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') {
                              const newExits = [...exits];
                              if (index >= 0 && index < newExits.length) {
                                newExits[index].percent = v || 0;
                                setExits(newExits);
                              }
                            }
                          }}
                          placeholder={t('tradeNew.percentPlaceholder')}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Exit Status */}
              {validExits.length > 0 && (
                <div className={cn(
                  "p-2 rounded text-xs text-center",
                  Math.abs(totalExitPercent - 100) <= 0.1
                    ? "bg-success/10 text-success"
                    : totalExitPercent > 100
                    ? "bg-destructive/10 text-destructive"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                )}>
                  {t('tradeDetail.totalPositionClosed')} {totalExitPercent.toFixed(1)}%
                </div>
              )}

              {/* Close Date */}
              <div className="border-2 border-white rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="closeDate" className="text-sm font-semibold">{t('tradeDetail.closeDate')}</Label>
                  <Input
                    id="closeDate"
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('tradeNew.optional')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trade Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tradeDetail.tradeNotes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              const MAX_NOTES_LENGTH = 10000;
              if (e.target.value.length <= MAX_NOTES_LENGTH) {
                setNotes(e.target.value);
              }
            }}
            placeholder={t('tradeDetail.tradeNotesPlaceholder')}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {notes.length} / 10,000 characters
          </p>
        </CardContent>
      </Card>

      {/* Save Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button
          variant="outline"
          onClick={() => navigate('/journal')}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="w-full sm:w-auto"
        >
          {saving ? t('tradeDetail.saving') : t('tradeDetail.saveChanges')}
        </Button>
      </div>
    </div>
  );
}
