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
import { ArrowLeft, Copy, Trash2, AlertCircle, TrendingUp, TrendingDown, Calendar, Plus, X, Calculator } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { useEntryManager } from '../hooks/useEntryManager';
import { WeightedEntryDisplay } from '../components/WeightedEntryDisplay';
import { Switch } from '../components/ui/switch';

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

  // Editable execution fields
  const [effectivePe, setEffectivePe] = useState(0);
  const [exits, setExits] = useState<Exit[]>([]);
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  // Execution calculations (optional R redefinition)
  const [useExecutionR, setUseExecutionR] = useState(false);
  const [executionPortfolio, setExecutionPortfolio] = useState(0);
  const [executionRPercent, setExecutionRPercent] = useState(0);

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
        execution_margin: executionCalculations.margin,
        execution_position_size: executionCalculations.positionSize,
        execution_quantity: executionCalculations.quantity,
        execution_one_r: executionCalculations.oneR,
        execution_potential_profit: executionCalculations.potentialProfit,
      } : {
        execution_portfolio: undefined,
        execution_r_percent: undefined,
        execution_margin: undefined,
        execution_position_size: undefined,
        execution_quantity: undefined,
        execution_one_r: undefined,
        execution_potential_profit: undefined,
      };

      await api.updateTrade(trade.id, {
        // Basic fields
        pair: pair.toUpperCase(),
        exchange: exchange,
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
      {/* Header - Linear Design */}
      <div className="flex items-center justify-between gap-4">
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

      {/* Key Metrics Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('tradeDetail.risk1R')}</p>
                <p className="text-2xl font-bold">{formatCurrency(trade.one_r)}</p>
                <p className="text-xs text-muted-foreground">{formatPercent(trade.r_percent)} {t('tradeDetail.riskPercent')}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('tradeDetail.plannedRR')}</p>
                <p className="text-2xl font-bold">{formatRR(trade.planned_weighted_rr)}</p>
                <p className="text-xs text-muted-foreground">{t('tradeDetail.minRequired')}: {formatRR(trade.min_rr)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('tradeDetail.actualPnL')}</p>
                <p className={`text-2xl font-bold ${
                  trade.total_pnl
                    ? (trade.total_pnl >= 0 ? 'text-green-500' : 'text-red-500')
                    : ''
                }`}>
                  {trade.total_pnl ? formatCurrency(trade.total_pnl) : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {trade.effective_weighted_rr ? `${formatRR(trade.effective_weighted_rr)} RR` : t('tradeDetail.notClosed')}
                </p>
              </div>
              {trade.total_pnl && (trade.total_pnl >= 0 ?
                <TrendingUp className="h-8 w-8 text-green-500" /> :
                <TrendingDown className="h-8 w-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Trade Plan (Editable) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-muted/50">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('tradeDetail.tradePlan')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Dates */}
              <div className="grid gap-3 grid-cols-2">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.analysisDate')}</div>
                  <div className="text-sm font-semibold">
                    {new Date(trade.analysis_date * 1000).toLocaleDateString()}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.tradeDate')}</div>
                  <div className="text-sm font-semibold">
                    {new Date(trade.trade_date * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Planned Entries (Multi-PE) - Editable */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('tradeDetail.plannedEntries') || 'Planned Entries'}
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
              <div className="grid gap-3 grid-cols-2 pt-3">
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

              {/* Take Profits - Editable */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeDetail.plannedTakeProfits')}</div>
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
              <div className="pt-3 border-t space-y-2">
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

        {/* Right Column: Execution (Editable) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t('tradeDetail.tradeExecution')}
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPlanToExecution}
                  disabled={!trade}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('tradeDetail.copyPlan')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Effective Entries (Multi-PE) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('tradeDetail.effectiveEntries') || 'Actual Entries'}
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
                      totalFilled === 100 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
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

              {/* Execution R Override Section */}
              <div className="space-y-3 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    Execution Calculations (Optional)
                  </Label>
                  <Switch
                    checked={useExecutionR}
                    onCheckedChange={setUseExecutionR}
                  />
                </div>

                {useExecutionR && (
                  <div className="space-y-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-xs text-muted-foreground">
                      Override portfolio and R% to recalculate position metrics
                    </p>

                    <div className="grid gap-3 grid-cols-2">
                      <div>
                        <Label htmlFor="execution-portfolio" className="text-xs">
                          Portfolio ($)
                        </Label>
                        <Input
                          id="execution-portfolio"
                          type="number"
                          step="0.01"
                          value={executionPortfolio || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') setExecutionPortfolio(v || 0);
                          }}
                          placeholder={trade?.portfolio_value.toString() || '0'}
                          className="font-mono text-sm"
                        />
                      </div>

                      <div>
                        <Label htmlFor="execution-r-percent" className="text-xs">
                          R %
                        </Label>
                        <Input
                          id="execution-r-percent"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={executionRPercent || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') setExecutionRPercent(v || 0);
                          }}
                          placeholder={trade ? (trade.r_percent * 100).toString() : '0'}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Exit Points */}
              <div className="space-y-3 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t('tradeNew.actualExits')}</Label>
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
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{t('import.exit')} {index + 1}</Badge>
                      <div className="flex items-center gap-2">
                        {plannedTps[index]?.percent != null && (
                          <span className="text-xs text-muted-foreground">
                            {t('tradeNew.plannedSetup')}: {plannedTps[index]?.percent?.toFixed(1)}% @ ${plannedTps[index]?.price?.toFixed(8)}
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
                <div className={`p-3 rounded-lg border-2 ${
                  Math.abs(totalExitPercent - 100) <= 0.1
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-500'
                    : totalExitPercent > 100
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-500'
                    : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-500'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{t('tradeDetail.totalPositionClosed')}</div>
                      <div className="text-2xl font-bold">{totalExitPercent.toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      {Math.abs(totalExitPercent - 100) <= 0.1 ? (
                        <Badge variant="default" className="bg-green-500">{t('tradeDetail.tradeComplete')}</Badge>
                      ) : totalExitPercent > 100 ? (
                        <Badge variant="destructive">{t('tradeDetail.exceeds100')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('tradeDetail.partialExit')}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Calculations Display */}
              {useExecutionR && executionCalculations && (
                <Card className="border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Execution Calculations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3 space-y-3">
                    {/* Position Type */}
                    <div className="text-center">
                      <Badge variant={executionCalculations.type === 'LONG' ? 'default' : 'destructive'}>
                        {executionCalculations.type}
                      </Badge>
                    </div>

                    {/* Primary Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">Margin</div>
                        <div className="text-lg font-bold">
                          {formatCurrency(executionCalculations.margin)}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">Position</div>
                        <div className="text-lg font-bold">
                          {formatCurrency(executionCalculations.positionSize)}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">Quantity</div>
                        <div className="text-lg font-bold">
                          {executionCalculations.quantity.toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {/* Secondary Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">1R</div>
                        <div className="text-sm font-semibold">
                          {formatCurrency(executionCalculations.oneR)}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">RR Ratio</div>
                        <div className="text-sm font-semibold">
                          {formatRR(executionCalculations.plannedWeightedRR)}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="text-[10px] text-muted-foreground uppercase">Pot. Profit</div>
                        <div className="text-sm font-semibold text-success">
                          {formatCurrency(executionCalculations.potentialProfit)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Close Date */}
              <div className="space-y-3 pt-3 border-t">
                <div className="space-y-2">
                  <Label htmlFor="closeDate" className="text-xs font-semibold">{t('tradeDetail.closeDate')}</Label>
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

          {/* Live Results Preview */}
          {executionValid && executionMetrics && (
            <Card className="border-2 border-primary">
              <CardHeader className="bg-primary/10">
                <CardTitle className="text-lg">{t('tradeDetail.liveResults')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.realizedPnL')}</div>
                    <div className={`text-3xl font-bold ${
                      executionMetrics.realizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {formatCurrency(executionMetrics.realizedPnl)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">{t('tradeDetail.totalPnLIfComplete')}</div>
                    <div className={`text-3xl font-bold ${
                      executionMetrics.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {formatCurrency(executionMetrics.totalPnl)}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('tradeDetail.effectiveRR')}</div>
                      <div className="text-2xl font-bold">{formatRR(executionMetrics.effectiveRR)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t('tradeDetail.vsPlanned')}</div>
                      <div className={`text-lg font-semibold ${
                        executionMetrics.effectiveRR >= trade.planned_weighted_rr
                          ? 'text-green-500'
                          : 'text-yellow-500'
                      }`}>
                        {executionMetrics.effectiveRR >= trade.planned_weighted_rr
                          ? `✓ ${t('tradeDetail.exceeded')}`
                          : `△ ${t('tradeDetail.belowPlan')}`
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('tradeDetail.saveChangesToUpdate')}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/journal')}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="lg"
              >
                {saving ? t('tradeDetail.saving') : t('tradeDetail.saveChanges')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
