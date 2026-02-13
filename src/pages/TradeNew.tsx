import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { calculateTradeMetrics, calculateWeightedEntry } from '../lib/calculations';
import { formatCurrency, formatRR, cn } from '../lib/utils';
import { validateAllocation } from '../lib/validations';
import { ArrowLeft, AlertCircle, Calendar, TrendingUp, Copy, Plus, X, Calculator } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { useEntryManager } from '../hooks/useEntryManager';
import { WeightedEntryDisplay } from '../components/WeightedEntryDisplay';
import { Switch } from '../components/ui/switch';

type TakeProfit = {
  price: number;
  percent: number;
};

export default function TradeNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Check if data came from calculator
  const calculatorData = location.state?.fromCalculator ? location.state.calculatorData : null;

  // Form state - PLAN SECTION
  const [pair, setPair] = useState('');
  const [exchange, setExchange] = useState('');
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [portfolio, setPortfolio] = useState(calculatorData?.portfolio || 10000);
  const [rPercent, setRPercent] = useState(calculatorData?.rPercent || 2);
  const [minRR, setMinRR] = useState(calculatorData?.minRR || 2);
  const [plannedPe, setPlannedPe] = useState(calculatorData?.pe || 0);
  const [plannedSl, setPlannedSl] = useState(calculatorData?.sl || 0);
  const [leverage, setLeverage] = useState(calculatorData?.leverage || 10);

  // Initialize TPs from calculator (supports both old single TP and new multi-TP)
  const [plannedTps, setPlannedTps] = useState(() => {
    if (calculatorData?.tps && Array.isArray(calculatorData.tps)) {
      // New format: multiple TPs from calculator
      return calculatorData.tps.length > 0 ? calculatorData.tps : [{ price: 0, percent: 0 }];
    } else if (calculatorData?.tp) {
      // Old format: single TP (backward compatibility)
      return [
        { price: calculatorData.tp, percent: 100 },
        { price: 0, percent: 0 },
        { price: 0, percent: 0 },
        { price: 0, percent: 0 },
      ];
    }
    // Default: empty TPs
    return [
      { price: 0, percent: 0 },
      { price: 0, percent: 0 },
      { price: 0, percent: 0 },
      { price: 0, percent: 0 },
    ];
  });

  // Initialize entries from calculator (using custom hook)
  const initialPlannedEntries = (() => {
    if (calculatorData?.entries && Array.isArray(calculatorData.entries)) {
      return calculatorData.entries.length > 0 ? calculatorData.entries : [{ price: 0, percent: 100 }];
    } else if (calculatorData?.pe) {
      return [{ price: calculatorData.pe, percent: 100 }];
    }
    return [{ price: 0, percent: 100 }];
  })();

  const plannedEntriesManager = useEntryManager(initialPlannedEntries);
  const {
    entries: plannedEntries,
    add: addPlannedEntry,
    remove: removePlannedEntry,
    update: updatePlannedEntry
  } = plannedEntriesManager;

  // Effective entries (using custom hook)
  const effectiveEntriesManager = useEntryManager([{ price: 0, percent: 0 }]);
  const {
    entries: effectiveEntries,
    setEntries: setEffectiveEntries,
    add: addEffectiveEntry,
    remove: removeEffectiveEntry,
    update: updateEffectiveEntry
  } = effectiveEntriesManager;

  // Form state - EXECUTION SECTION
  const [closeDate, setCloseDate] = useState('');
  const [exits, setExits] = useState([
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
  ]);

  // Unified notes
  const [notes, setNotes] = useState('');

  // Execution calculations (optional R redefinition)
  const [useExecutionR, setUseExecutionR] = useState(false);
  const [executionPortfolio, setExecutionPortfolio] = useState(0);
  const [executionRPercent, setExecutionRPercent] = useState(0);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.getSettings();
        if (!calculatorData) {
          setPortfolio(data.initial_capital);
          setRPercent(data.current_r_percent * 100); // Convert from decimal to percentage
          setMinRR(data.default_min_rr);
          setLeverage(data.default_leverage);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, [calculatorData]);

  // Sync plannedPe with weighted entry price for backward compatibility
  useEffect(() => {
    const validEntries = plannedEntries.filter(e => e.price > 0 && e.percent > 0);
    if (validEntries.length > 0) {
      try {
        const weighted = calculateWeightedEntry(validEntries);
        setPlannedPe(weighted);
      } catch (error) {
        console.error('Failed to calculate weighted entry:', error);
        // Keep existing plannedPe value on error
      }
    }
  }, [plannedEntries]);

  // Calculate metrics for plan (memoized for performance)
  const planCalculation = useMemo(() => {
    let planMetrics = null;
    let planValidation = { valid: false, errors: [] as string[], warnings: [] as string[] };

    try {
      // Validate planned entries
      const validEntries = plannedEntries.filter(e => e.price > 0);
      const entryValidation = validateAllocation(plannedEntries);

      if ((validEntries.length > 0 || plannedPe) && plannedSl && plannedTps.some((tp: TakeProfit) => tp.price > 0)) {
        const validTps = plannedTps.filter((tp: TakeProfit) => tp.price > 0);
        const tpValidation = validateAllocation(plannedTps);

        planValidation.errors = [];
        planValidation.warnings = [];

        // Validate entries
        if (validEntries.length === 0 && !plannedPe) {
          planValidation.errors.push('At least one entry is required');
        }

        // Add allocation errors from utility
        planValidation.errors.push(...entryValidation.errors, ...tpValidation.errors);

        if (entryValidation.valid && tpValidation.valid) {
          const normalizedTps = validTps.map((tp: TakeProfit) => ({
            price: tp.price,
            percent: tp.percent / tpValidation.total
          }));

          // Use entries if available, otherwise fall back to single PE
          const entriesForCalc = validEntries.length > 0 ? validEntries : undefined;
          const peForCalc = validEntries.length === 0 ? plannedPe : undefined;

          planMetrics = calculateTradeMetrics({
            portfolio,
            rPercent: rPercent / 100,
            entries: entriesForCalc,
            pe: peForCalc,
            sl: plannedSl,
            tps: normalizedTps,
            leverage,
          });

          // R:R check is now a warning, not a blocking error
          if (planMetrics.plannedWeightedRR < minRR) {
            planValidation.warnings.push(`RR (${planMetrics.plannedWeightedRR.toFixed(2)}) is below minimum (${minRR})`);
          }
          if (planMetrics.maxLeverage !== null && leverage > planMetrics.maxLeverage) {
            planValidation.errors.push(`Leverage (${leverage}x) exceeds max (${planMetrics.maxLeverage}x)`);
          }
        }

        planValidation.valid = planValidation.errors.length === 0;
      }
    } catch (error) {
      console.error('Calculation error:', error);
    }

    return { planMetrics, planValidation };
  }, [plannedEntries, plannedPe, plannedSl, plannedTps, portfolio, rPercent, minRR, leverage]);

  const { planMetrics, planValidation } = planCalculation;

  // Calculate execution R calculations
  const executionCalculations = useMemo(() => {
    if (!useExecutionR || !executionPortfolio || !executionRPercent) return null;

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
      : plannedTps.filter((tp: TakeProfit) => tp.price > 0);

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
  }, [useExecutionR, executionPortfolio, executionRPercent, effectiveEntries, exits, plannedTps, plannedSl, leverage]);

  const handleCopyPlanToExecution = () => {
    // Copy entries
    const copiedEntries = plannedEntries.map(e => ({
      price: e.price,
      percent: e.percent
    }));
    setEffectiveEntries(copiedEntries);

    // Copy TPs to exits with same structure
    const copiedExits = plannedTps.map((tp: TakeProfit) => ({
      price: tp.price,
      percent: tp.percent
    }));
    setExits(copiedExits);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planValidation.valid || !planMetrics) return;

    if (planMetrics.type === 'UNDEFINED') {
      toast.error(t('tradeNew.invalidSetup'));
      return;
    }

    setSaving(true);
    try {
      const plannedTpsJson = JSON.stringify(planMetrics.tpsWithRR.map(tp => ({
        price: tp.price,
        percent: tp.percent * 100,
        rr: tp.rr,
      })));

      // Prepare planned entries
      const validEntries = plannedEntries.filter(e => e.price > 0);
      const plannedEntriesJson = validEntries.length > 0
        ? JSON.stringify(validEntries.map(e => ({
            price: e.price,
            percent: e.percent
          })))
        : undefined;

      // Calculate weighted PE for backward compatibility
      let weightedPE = plannedPe;
      if (validEntries.length > 0) {
        try {
          weightedPE = calculateWeightedEntry(validEntries);
        } catch (error) {
          console.error('Failed to calculate weighted entry:', error);
          toast.error('Invalid entry configuration. Please check your entry allocations.');
          setSaving(false);
          return;
        }
      }

      await api.createTrade({
        pair: pair.toUpperCase(),
        exchange,
        analysis_date: Math.floor(new Date(analysisDate).getTime() / 1000),
        trade_date: Math.floor(new Date(tradeDate).getTime() / 1000),
        status: 'OPEN',
        portfolio_value: portfolio,
        r_percent: rPercent / 100,
        min_rr: minRR,
        planned_pe: weightedPE,
        planned_sl: plannedSl,
        leverage,
        planned_tps: plannedTpsJson,
        planned_entries: plannedEntriesJson,
        position_type: planMetrics.type,
        one_r: planMetrics.oneR,
        margin: planMetrics.margin,
        position_size: planMetrics.positionSize,
        quantity: planMetrics.quantity,
        planned_weighted_rr: planMetrics.plannedWeightedRR,
        notes,
        execution_portfolio: useExecutionR && executionCalculations ? executionPortfolio : undefined,
        execution_r_percent: useExecutionR && executionCalculations ? executionRPercent / 100 : undefined,
        execution_margin: executionCalculations?.margin,
        execution_position_size: executionCalculations?.positionSize,
        execution_quantity: executionCalculations?.quantity,
        execution_one_r: executionCalculations?.oneR,
        execution_potential_profit: executionCalculations?.potentialProfit,
      });

      toast.success(t('tradeNew.tradeCreated') || 'Trade created successfully');
      navigate('/journal');
    } catch (error) {
      console.error('Failed to create trade:', error);
      toast.error(t('tradeNew.failedToCreate') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/journal')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {calculatorData ? t('tradeNew.titleFromCalculator') : t('tradeNew.title')}
            <HelpBadge section="journal" />
          </h1>
          <p className="text-muted-foreground">
            {t('tradeNew.subtitle')}
          </p>
        </div>
      </div>

      {calculatorData && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-500/50">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <strong>{t('calculator.copied')}</strong> {t('tradeNew.subtitle')}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN: TRADE PLAN */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-muted/50">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('tradeNew.tradePlan')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <div className="text-sm font-semibold">{t('tradeNew.basicInformation')}</div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pair" className="text-xs font-semibold">{t('tradeNew.tradingPairRequired')}</Label>
                    <Input
                      id="pair"
                      value={pair}
                      onChange={(e) => setPair(e.target.value)}
                      placeholder={t('tradeNew.pairPlaceholder')}
                      className={!pair ? 'field-required' : ''}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exchange" className="text-xs font-semibold">{t('tradeNew.exchangeRequired')}</Label>
                    <Input
                      id="exchange"
                      value={exchange}
                      onChange={(e) => setExchange(e.target.value)}
                      placeholder={t('tradeNew.exchangePlaceholder')}
                      className={!exchange ? 'field-required' : ''}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="analysisDate" className="text-xs font-semibold">{t('tradeNew.analysisDate')}</Label>
                    <Input
                      id="analysisDate"
                      type="date"
                      value={analysisDate}
                      onChange={(e) => setAnalysisDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradeDate" className="text-xs font-semibold">{t('tradeNew.tradeDate')}</Label>
                    <Input
                      id="tradeDate"
                      type="date"
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Portfolio Settings */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeNew.portfolioSettings')}</div>
                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="portfolio" className="text-xs">{t('tradeNew.portfolio')}</Label>
                    <Input
                      id="portfolio"
                      type="number"
                      value={portfolio}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') setPortfolio(v || 0);
                      }}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rPercent" className="text-xs">{t('tradeNew.riskPercent')}</Label>
                    <Input
                      id="rPercent"
                      type="number"
                      step="0.1"
                      value={rPercent}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') setRPercent(v || 0);
                      }}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minRR" className="text-xs">{t('tradeNew.minRR')}</Label>
                    <Input
                      id="minRR"
                      type="number"
                      step="0.1"
                      value={minRR}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') setMinRR(v || 0);
                      }}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Planned Setup */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeNew.plannedSetup')}</div>

                {/* Multi-PE Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      {t('tradeNew.plannedEntries')}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPlannedEntry}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('tradeNew.addEntry')}
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
                          <Label htmlFor={`entry${index}-price`} className="text-xs">
                            {t('calculator.entryShort')} {index === 0 && '*'}
                          </Label>
                          <Input
                            id={`entry${index}-price`}
                            type="number"
                            step="0.00000001"
                            value={entry.price || ''}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) || e.target.value === '') updatePlannedEntry(index, 'price', v || 0);
                            }}
                            placeholder="0.00"
                            className={`font-mono text-sm ${index === 0 && !entry.price ? 'field-required' : ''}`}
                            required={index === 0}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`entry${index}-percent`} className="text-xs">
                            {t('tradeNew.allocationPercent')}
                          </Label>
                          <Input
                            id={`entry${index}-percent`}
                            type="number"
                            min="0"
                            max="100"
                            value={entry.percent || ''}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) || e.target.value === '') updatePlannedEntry(index, 'percent', v || 0);
                            }}
                            placeholder="0"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Allocation Summary */}
                  {(() => {
                    const validEntries = plannedEntries.filter(e => e.price > 0);
                    const totalPercent = validEntries.reduce((sum, e) => sum + e.percent, 0);
                    const isValid = Math.abs(totalPercent - 100) <= 0.1;

                    return validEntries.length > 0 && (
                      <div className={cn(
                        "p-3 rounded-lg border",
                        isValid ? "bg-green-50 border-green-500/50" : "bg-yellow-50 border-yellow-500/50"
                      )}>
                        <div className="text-xs text-muted-foreground mb-1">
                          Total Allocation: {totalPercent.toFixed(1)}%
                        </div>
                        {!isValid && (
                          <p className="text-xs text-yellow-700">
                            Must equal 100%
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Weighted Average Display */}
                  <WeightedEntryDisplay
                    entries={plannedEntries}
                    label={t('tradeNew.weightedAverageEntry')}
                  />
                </div>

                {/* Stop Loss & Leverage */}
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
                      className={`font-mono text-sm ${!plannedSl ? 'field-required' : ''}`}
                      placeholder={t('tradeNew.pricePlaceholder')}
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
                      className={`text-sm ${planMetrics && planMetrics.maxLeverage !== null && leverage > planMetrics.maxLeverage ? 'border-destructive' : ''}`}
                    />
                    {planMetrics && (
                      <div className="text-xs space-y-1">
                        <div className="text-muted-foreground">
                          {t('tradeNew.maxSafe')}: {planMetrics.maxLeverage !== null ? `${planMetrics.maxLeverage}x` : 'N/A'}
                        </div>
                        {planMetrics.maxLeverage !== null && leverage > planMetrics.maxLeverage && (
                          <div className="text-destructive font-medium flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {t('tradeNew.leverageExceedsSafe')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Validation Errors */}
                {planValidation.errors.length > 0 && (
                  <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="flex-1 space-y-1">
                        {planValidation.errors.map((error, idx) => (
                          <div key={idx} className="text-sm text-destructive">
                            {error}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Warnings (non-blocking) */}
                {planValidation.warnings && planValidation.warnings.length > 0 && (
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-500/50 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        {planValidation.warnings.map((warning, idx) => (
                          <div key={idx} className="text-sm text-yellow-700 dark:text-yellow-500">
                            {warning}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Planned Take Profits */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeNew.plannedTakeProfits')}</div>
                {plannedTps.map((tp: TakeProfit, index: number) => (
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
                            newTps[index].price = v || 0;
                            setPlannedTps(newTps);
                          }
                        }}
                        placeholder={t('tradeNew.pricePlaceholder')}
                        className={`font-mono text-sm ${index === 0 && !tp.price ? 'field-required' : ''}`}
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
                            newTps[index].percent = v || 0;
                            setPlannedTps(newTps);
                          }
                        }}
                        placeholder={t('tradeNew.percentPlaceholder')}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Validation Errors */}
              {planValidation.errors.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold text-destructive mb-1">{t('calculator.validationErrors')}:</div>
                    <ul className="space-y-1">
                      {planValidation.errors.map((error, i) => (
                        <li key={i} className="text-destructive">• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Validation Warnings (non-blocking) */}
              {planValidation.warnings && planValidation.warnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-500/50">
                  <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold text-yellow-700 dark:text-yellow-500 mb-1">{t('calculator.warnings') || 'Warnings'}:</div>
                    <ul className="space-y-1">
                      {planValidation.warnings.map((warning, i) => (
                        <li key={i} className="text-yellow-700 dark:text-yellow-500">• {warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Plan Metrics Preview */}
              {planMetrics && planValidation.valid && (
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="text-sm font-semibold mb-2">{t('tradeNew.calculatedResults')}</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('tradeNew.position')}</div>
                      <div className="font-semibold">{formatCurrency(planMetrics.positionSize)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('tradeNew.quantity')}</div>
                      <div className="font-semibold">{planMetrics.quantity.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t('tradeNew.rrRatio')}</div>
                      <div className="font-semibold">{formatRR(planMetrics.plannedWeightedRR)}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: TRADE EXECUTION (Optional) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t('tradeNew.tradeExecution')}
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPlanToExecution}
                  disabled={!plannedPe}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('tradeNew.copyPlan')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <strong>{t('tradeNew.optional')}:</strong> {t('tradeNew.copyPlanToExecution')}
                </div>
              </div>

              {/* Effective Entries (Multi-PE) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('tradeNew.actualEntries')}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEffectiveEntry}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('tradeNew.addEntry')}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('tradeNew.actualEntriesHelp')}
                </p>

                {effectiveEntries.map((entry, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    {/* Show planned entry as reference */}
                    {plannedEntries[index]?.price > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Planned: {plannedEntries[index]?.percent}% @ ${plannedEntries[index]?.price?.toFixed(8)}
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
                          placeholder={portfolio.toString()}
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
                          placeholder={rPercent.toString()}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
              <div className="space-y-2 pt-3 border-t">
                <Label htmlFor="closeDate" className="text-xs font-semibold">{t('tradeDetail.closeDate')}</Label>
                <Input
                  id="closeDate"
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('tradeDetail.closeDateOptional')}</p>
              </div>

              {/* Actual Exits */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-sm font-semibold">{t('tradeNew.actualExits')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('tradeDetail.exits')}
                </p>
                {exits.map((exit, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{t('import.exit')} {index + 1}</Badge>
                      {plannedTps[index]?.price > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t('tradeNew.plannedSetup')}: {plannedTps[index]?.percent}% @ ${plannedTps[index]?.price?.toFixed(8)}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`exit${index}-price`} className="text-xs">{t('tradeDetail.exitPrice', { number: '' })}</Label>
                        <Input
                          id={`exit${index}-price`}
                          type="number"
                          step="0.00000001"
                          value={exit.price || ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') {
                              const newExits = [...exits];
                              newExits[index].price = v || 0;
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
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) || e.target.value === '') {
                              const newExits = [...exits];
                              newExits[index].percent = v || 0;
                              setExits(newExits);
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trade Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tradeNew.tradeNotes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('tradeNew.tradeNotesPlaceholder')}
            rows={6}
            className="resize-none"
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {planValidation.valid
                ? t('tradeNew.validPlan')
                : t('tradeNew.completeRequired')}
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/journal')}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={saving || !planValidation.valid}
                size="lg"
              >
                {saving ? t('tradeNew.saving') : t('tradeNew.saveTrade')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
