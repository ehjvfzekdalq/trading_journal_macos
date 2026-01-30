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
import { Checkbox } from '../components/ui/checkbox';
import { api, type Trade } from '../lib/api';
import { calculateExecutionMetrics, calculateWeightedEntry } from '../lib/calculations';
import { formatCurrency, formatRR, formatPercent, cn } from '../lib/utils';
import { ArrowLeft, Copy, Trash2, AlertCircle, TrendingUp, TrendingDown, Calendar, DollarSign, Plus, X } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { useEntryManager } from '../hooks/useEntryManager';
import { WeightedEntryDisplay } from '../components/WeightedEntryDisplay';

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

  // Editable plan fields
  const [plannedSl, setPlannedSl] = useState(0);
  const [leverage, setLeverage] = useState(10);
  const [plannedTps, setPlannedTps] = useState<Array<{price: number, percent: number}>>([]);

  // Editable execution fields
  const [effectivePe, setEffectivePe] = useState(0);
  const [exits, setExits] = useState<Exit[]>([]);
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [manualBE, setManualBE] = useState(false);

  useEffect(() => {
    if (id) {
      loadTrade(id);
    }
  }, [id]);

  const loadTrade = async (tradeId: string) => {
    try {
      const data = await api.getTrade(tradeId);
      setTrade(data);

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
      const parsedPlannedTps = typeof data.planned_tps === 'string'
        ? JSON.parse(data.planned_tps)
        : data.planned_tps;
      setPlannedTps(parsedPlannedTps);

      // Initialize execution fields
      setEffectivePe(data.effective_pe || data.planned_pe);

      if (data.exits) {
        try {
          const parsedExits = typeof data.exits === 'string'
            ? JSON.parse(data.exits)
            : data.exits;
          setExits(parsedExits);
        } catch {
          setExits([]);
        }
      } else {
        // Initialize with empty exits matching TPs
        setExits(parsedPlannedTps.map(() => ({ price: 0, percent: 0 })));
      }

      if (data.close_date) {
        setCloseDate(new Date(data.close_date * 1000).toISOString().split('T')[0]);
      }

      setNotes(data.notes || '');

      // Initialize manual BE checkbox if trade is marked as BE
      setManualBE(data.status === 'BE');
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
        setManualBE(false); // Reset BE checkbox when no exits
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

          const metrics = calculateExecutionMetrics({
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

          // Auto-uncheck BE if P&L is not near zero (has significant profit/loss)
          if (manualBE && Math.abs(metrics.totalPnl) >= 1.0) {
            setManualBE(false);
          }

          // Determine status based on P&L (with manual BE override for edge cases)
          // Status is ALWAYS recalculated based on current execution data
          if (Math.abs(metrics.totalPnl) < 0.5) {
            // P&L is near zero - this is break-even
            newStatus = 'BE';
          } else if (metrics.totalPnl > 0) {
            newStatus = 'WIN';
          } else {
            newStatus = 'LOSS';
          }

          // Manual BE override: only if user explicitly wants BE despite small profit/loss
          if (manualBE && Math.abs(metrics.totalPnl) < 1.0) {
            newStatus = 'BE';
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
      const weightedPlannedPE = validPlannedEntries.length > 0
        ? calculateWeightedEntry(validPlannedEntries)
        : trade.planned_pe;

      // Prepare planned TPs
      const plannedTpsJson = JSON.stringify(plannedTps);

      // Prepare effective entries
      const validEffectiveEntries = effectiveEntries.filter(e => e.price > 0);
      const effectiveEntriesJson = validEffectiveEntries.length > 0
        ? JSON.stringify(validEffectiveEntries)
        : undefined;

      // Calculate weighted effective PE
      const weightedEffectivePE = validEffectiveEntries.length > 0
        ? calculateWeightedEntry(validEffectiveEntries)
        : effectivePe;

      // Calculate P&L in R multiples
      const pnlInR = totalPnl !== null && trade.one_r > 0
        ? totalPnl / trade.one_r
        : null;

      await api.updateTrade(trade.id, {
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
        close_date: closeDateTimestamp || undefined,
        total_pnl: totalPnl || undefined,
        pnl_in_r: pnlInR || undefined,
        effective_weighted_rr: effectiveRR || undefined,
        status: newStatus,
        notes: notes,
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

  // Calculate current metrics (memoized)
  const { executionMetrics, executionValid, validExits, totalExitPercent } = useMemo(() => {
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
    }

    return { executionMetrics, executionValid, validExits, totalExitPercent };
  }, [exits, effectiveEntries, effectivePe, trade.planned_sl, trade.one_r, trade.position_size, trade.position_type]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{trade.pair}</h1>
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
            </div>
            <p className="text-muted-foreground mt-1">{trade.exchange}</p>
          </div>
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('tradeDetail.portfolioValue')}</p>
                <p className="text-2xl font-bold">{formatCurrency(trade.portfolio_value)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

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
                          onChange={(e) => updatePlannedEntry(index, 'price', Number(e.target.value))}
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
                          onChange={(e) => updatePlannedEntry(index, 'percent', Number(e.target.value))}
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
                    onChange={(e) => setPlannedSl(Number(e.target.value))}
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
                    onChange={(e) => setLeverage(Number(e.target.value))}
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
                          const newTps = [...plannedTps];
                          if (index >= 0 && index < newTps.length) {
                            newTps[index].price = Number(e.target.value);
                            setPlannedTps(newTps);
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
                          const newTps = [...plannedTps];
                          if (index >= 0 && index < newTps.length) {
                            newTps[index].percent = Number(e.target.value);
                            setPlannedTps(newTps);
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
                          onChange={(e) => updateEffectiveEntry(index, 'price', Number(e.target.value))}
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
                          onChange={(e) => updateEffectiveEntry(index, 'percent', Number(e.target.value))}
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

              {/* Exit Points */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-sm font-semibold">{t('tradeNew.actualExits')}</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('tradeDetail.exits')}
                </p>

                {exits.map((exit, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{t('import.exit')} {index + 1}</Badge>
                      {plannedTps[index]?.percent != null && (
                        <span className="text-xs text-muted-foreground">
                          {t('tradeNew.plannedSetup')}: {plannedTps[index]?.percent?.toFixed(1)}% @ ${plannedTps[index]?.price?.toFixed(8)}
                        </span>
                      )}
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
                            const newExits = [...exits];
                            if (index >= 0 && index < newExits.length) {
                              newExits[index].price = Number(e.target.value);
                              setExits(newExits);
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
                            const newExits = [...exits];
                            if (index >= 0 && index < newExits.length) {
                              newExits[index].percent = Number(e.target.value);
                              setExits(newExits);
                            }
                          }}
                          disabled={!exit.price}
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

              {/* Close Date and Manual BE */}
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

                {/* Manual Break-Even Checkbox */}
                <div className="flex items-center space-x-2 pt-3 border-t">
                  <Checkbox
                    id="manualBE"
                    checked={manualBE}
                    onCheckedChange={(checked) => setManualBE(checked as boolean)}
                  />
                  <Label
                    htmlFor="manualBE"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {t('tradeDetail.markAsBreakEven')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('tradeDetail.markAsBreakEvenHelp')}
                </p>
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
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('tradeDetail.tradeNotesPlaceholder')}
            rows={6}
            className="resize-none"
          />
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
