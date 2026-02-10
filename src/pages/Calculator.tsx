import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Copy, Check, AlertCircle, Save, HelpCircle, ArrowRight, Plus, X } from 'lucide-react';
import { calculateTradeMetrics } from '../lib/calculations';
import { formatCurrency, formatPercent, formatRR, cn } from '../lib/utils';
import { validateAllocation } from '../lib/validations';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { api } from '../lib/api';
import { HelpBadge } from '../components/HelpBadge';
import { useEntryManager } from '../hooks/useEntryManager';
import { WeightedEntryDisplay } from '../components/WeightedEntryDisplay';

// Help tooltips component
const HelpTooltip = ({ title, content }: { title: string; content: string | React.ReactNode }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {show && (
        <div className="absolute z-50 left-0 top-full mt-2 w-80 p-4 bg-popover border border-border rounded-lg shadow-lg text-sm">
          <div className="font-semibold mb-2">{title}</div>
          <div className="text-muted-foreground space-y-2">{content}</div>
        </div>
      )}
    </div>
  );
};

export default function Calculator() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Step 1: Strategy Settings
  const [portfolio, setPortfolio] = useState(10000);
  const [rPercent, setRPercent] = useState(2);
  const [minRR, setMinRR] = useState(2);

  // Step 2: Trade Setup - Multiple Entries (using custom hook)
  const entriesManager = useEntryManager([{ price: 0, percent: 100 }]);
  const { entries, add: addEntry, remove: removeEntry, update: updateEntry } = entriesManager;

  const [sl, setSl] = useState(0);

  // Multiple Take Profits (using custom hook)
  const tpsManager = useEntryManager([{ price: 0, percent: 100 }]);
  const { entries: tps, add: addTp, remove: removeTp, update: updateTp } = tpsManager;

  // Step 3: Leverage
  const [leverage, setLeverage] = useState(10);

  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setPortfolio(settings.initial_capital);
      setRPercent(settings.current_r_percent * 100); // Convert from decimal to percentage
      setMinRR(settings.default_min_rr);
      setLeverage(settings.default_leverage);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.updateSettings({
        initial_capital: portfolio,
        current_r_percent: rPercent / 100, // Convert from percentage to decimal
        default_min_rr: minRR,
        default_leverage: leverage,
      });
      toast.success(t('calculator.settingsSaved') || 'Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(t('calculator.saveFailed') || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Memoized calculations for performance
  const calculationResult = useMemo(() => {
    let metrics = null;
    let isValid = false;
    let validationErrors: string[] = [];
    let validationWarnings: string[] = [];
    let showResults = false;

    // Validate entries and TPs using utility function
    const validEntries = entries.filter(e => e.price > 0);
    const validTps = tps.filter(tp => tp.price > 0);

    const entryValidation = validateAllocation(entries);
    const tpValidation = validateAllocation(tps);

    try {
      if (validEntries.length > 0 && sl && validTps.length > 0 && portfolio && rPercent) {
        // Add validation errors
        validationErrors.push(...entryValidation.errors, ...tpValidation.errors);

        // Normalize allocations
        const normalizedEntries = validEntries.map(e => ({
          price: e.price,
          percent: e.percent / entryValidation.total
        }));

        const normalizedTps = validTps.map(tp => ({
          price: tp.price,
          percent: tp.percent / tpValidation.total
        }));

        metrics = calculateTradeMetrics({
          portfolio,
          rPercent: rPercent / 100,
          entries: normalizedEntries,
          sl,
          tps: normalizedTps,
          leverage,
        });

        showResults = true;

        const weightedRR = metrics.plannedWeightedRR;
        const rrCheck = weightedRR >= minRR;
        const leverageCheck = metrics.maxLeverage === null || leverage <= metrics.maxLeverage;

        if (!rrCheck) {
          // RR below minimum is now just a warning, not blocking
          validationWarnings.push(`Weighted RR (${weightedRR.toFixed(2)}) is below minimum (${minRR})`);
        }
        if (!leverageCheck) {
          validationErrors.push(`Leverage (${leverage}x) exceeds max safe leverage (${metrics.maxLeverage}x)`);
        }

        // Only leverage and allocation errors block sending to journal
        isValid = leverageCheck && entryValidation.valid && tpValidation.valid;
      }
    } catch (error) {
      console.error('Calculation error:', error);
    }

    return { metrics, isValid, validationErrors, validationWarnings, showResults, validEntries, validTps };
  }, [entries, tps, sl, portfolio, rPercent, minRR, leverage]);

  const { metrics, isValid, validationErrors, validationWarnings, showResults, validEntries, validTps } = calculationResult;

  const handleCopy = async (text: string, field: string) => {
    try {
      await writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      // Fallback to standard clipboard API
      navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleSendToJournal = () => {
    if (!metrics || !isValid) return;

    // Navigate to new trade with calculator data
    navigate('/journal/new', {
      state: {
        fromCalculator: true,
        calculatorData: {
          portfolio,
          rPercent,
          minRR,
          entries: validEntries,
          sl,
          tps: validTps,
          leverage,
          metrics,
        },
      },
    });
  };

  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('calculator.title') || 'Position Calculator'}
          <HelpBadge section="calculator" />
        </h1>
        <p className="text-xs text-muted-foreground">
          {t('calculator.subtitle')}
        </p>
      </div>

      {/* Responsive layout: vertical on narrow screens, 3-column on wider screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* STEP 1: Strategy Settings */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </div>
              <CardTitle className="text-sm">
                {t('calculator.strategySettings') || 'Strategy'}
              </CardTitle>
              <HelpTooltip
                title={t('calculator.helpStrategyTitle')}
                content={
                  <div>
                    <p className="mb-2">{t('calculator.helpStrategyIntro')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('calculator.helpStrategyPortfolio')}</li>
                      <li>{t('calculator.helpStrategyRPercent')}</li>
                      <li>{t('calculator.helpStrategyMinRR')}</li>
                    </ul>
                    <p className="mt-2"><strong>{t('calculator.helpStrategyFormula')}</strong></p>
                  </div>
                }
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 space-y-2">
            <div className="space-y-1">
              <Label htmlFor="portfolio" className="text-xs">
                {t('calculator.portfolio') || 'Portfolio ($)'}
              </Label>
              <Input
                id="portfolio"
                type="number"
                value={portfolio}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) || e.target.value === '') setPortfolio(v || 0);
                }}
                className="h-8 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rPercent" className="text-xs">
                {t('calculator.rPercent') || 'R %'}
              </Label>
              <Input
                id="rPercent"
                type="number"
                step="0.1"
                value={rPercent}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) || e.target.value === '') setRPercent(v || 0);
                }}
                className="h-8 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="minRR" className="text-xs">
                {t('calculator.minRR') || 'Min RR'}
              </Label>
              <Input
                id="minRR"
                type="number"
                step="0.1"
                value={minRR}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) || e.target.value === '') setMinRR(v || 0);
                }}
                className="h-8 text-sm font-semibold"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full h-7 text-xs mt-1"
            >
              <Save className="h-3 w-3 mr-1.5" />
              {saving ? (t('calculator.saving') || 'Saving...') : (t('calculator.saveSettings') || 'Save Settings')}
            </Button>
          </CardContent>
        </Card>

        {/* STEP 2: Trade Setup - PE, SL, TP */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </div>
              <CardTitle className="text-sm">{t('calculator.tradeSetup')}</CardTitle>
              <HelpTooltip
                title={t('calculator.helpTradeSetupTitle')}
                content={
                  <div>
                    <p className="mb-2">{t('calculator.helpTradeSetupIntro')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('calculator.helpTradeSetupEntry')}</li>
                      <li>{t('calculator.helpTradeSetupStopLoss')}</li>
                      <li>{t('calculator.helpTradeSetupTakeProfit')}</li>
                    </ul>
                    <div className="mt-3 p-2 bg-muted/50 rounded text-xs font-mono">
                      <div>SL Distance = |PE - SL| / PE</div>
                      <div>Max Leverage = 1 / SL Distance</div>
                      <div>RR = (TP - PE) / (PE - SL)</div>
                    </div>
                  </div>
                }
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 space-y-2">
            {/* Multiple Entries - Compact */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {t('calculator.entry') || 'Entry'}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addEntry}
                  className="h-5 text-xs px-1.5"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {entries.map((entry, index) => (
                <div key={index} className="p-1.5 border rounded bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">PE{index + 1}</Badge>
                    {entries.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-1.5 grid-cols-2">
                    <Input
                      type="number"
                      step="0.00000001"
                      value={entry.price || ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') updateEntry(index, 'price', v || 0);
                      }}
                      placeholder="Price"
                      className={`font-mono text-xs h-6 ${index === 0 && !entry.price ? 'field-required' : ''}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={entry.percent || ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') updateEntry(index, 'percent', v || 0);
                      }}
                      disabled={!entry.price}
                      placeholder="%"
                      className="text-xs h-6"
                    />
                  </div>
                </div>
              ))}

              {/* Entry Allocation - Compact */}
              {(() => {
                const validEntries = entries.filter(e => e.price > 0);
                const totalPercent = validEntries.reduce((sum, e) => sum + e.percent, 0);
                const isValid = Math.abs(totalPercent - 100) <= 0.1;

                return validEntries.length > 0 && (
                  <div className={cn(
                    "px-2 py-0.5 text-[10px] flex justify-between",
                    isValid
                      ? "text-muted-foreground"
                      : "text-yellow-600 dark:text-yellow-500"
                  )}>
                    <span>Total:</span>
                    <span className="font-semibold">{totalPercent.toFixed(1)}%</span>
                  </div>
                );
              })()}

              {/* Weighted Average Entry - Compact */}
              <WeightedEntryDisplay entries={validEntries} />
            </div>

            {/* Stop Loss - Compact */}
            <div className="space-y-1 pt-1 border-t">
              <Label htmlFor="sl" className="text-xs font-semibold">{t('calculator.stopLoss')}</Label>
              <Input
                id="sl"
                type="number"
                step="0.00000001"
                value={sl}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) || e.target.value === '') setSl(v || 0);
                }}
                className={`font-mono text-xs h-7 ${!sl ? 'field-required' : ''}`}
                placeholder="0.00"
              />
            </div>

            {/* Multiple Take Profits - Compact */}
            <div className="space-y-1.5 pt-1 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Take Profit</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addTp}
                  className="h-5 text-xs px-1.5"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {tps.map((tp, index) => (
                <div key={index} className="p-1.5 border rounded bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">TP{index + 1}</Badge>
                    {tps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTp(index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-1.5 grid-cols-2">
                    <Input
                      type="number"
                      step="0.00000001"
                      value={tp.price || ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') updateTp(index, 'price', v || 0);
                      }}
                      placeholder="Price"
                      className={`font-mono text-xs h-6 ${index === 0 && !tp.price ? 'field-required' : ''}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={tp.percent || ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) || e.target.value === '') updateTp(index, 'percent', v || 0);
                      }}
                      disabled={!tp.price}
                      placeholder="%"
                      className="text-xs h-6"
                    />
                  </div>
                </div>
              ))}

              {/* TP Allocation - Compact */}
              {(() => {
                const validTps = tps.filter(tp => tp.price > 0);
                const totalPercent = validTps.reduce((sum, tp) => sum + tp.percent, 0);
                const isValid = Math.abs(totalPercent - 100) <= 0.1;

                return validTps.length > 0 && (
                  <div className={cn(
                    "px-2 py-0.5 text-[10px] flex justify-between",
                    isValid
                      ? "text-muted-foreground"
                      : "text-yellow-600 dark:text-yellow-500"
                  )}>
                    <span>Total:</span>
                    <span className="font-semibold">{totalPercent.toFixed(1)}%</span>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* STEP 3: Calculated Metrics & Leverage */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </div>
              <CardTitle className="text-sm">{t('calculator.setLeverage')}</CardTitle>
              <HelpTooltip
                title={t('calculator.helpLeverageTitle')}
                content={
                  <div>
                    <p className="mb-3 text-primary font-semibold italic">
                      {t('calculator.leverageNotRisk')}
                    </p>
                    <p className="mb-2">{t('calculator.helpLeverageIntro')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('calculator.helpLeverageHigher')}</li>
                      <li>{t('calculator.helpLeverageMax')}</li>
                      <li>{t('calculator.helpLeverageRisk')}</li>
                    </ul>
                  </div>
                }
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 space-y-3">
            {/* Calculated Metrics Display */}
            {metrics ? (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <div className="text-center">
                  <Badge
                    variant={metrics.type === 'LONG' ? 'default' : 'destructive'}
                    className="text-sm font-bold px-3 py-1"
                  >
                    {metrics.type}
                  </Badge>
                </div>
                <div className="space-y-1 text-center">
                  <div className="text-xs text-muted-foreground">SL Distance</div>
                  <div className="text-lg font-bold">
                    {formatPercent(metrics.distances.distanceSL_PCT)}
                  </div>
                </div>
                <div className="space-y-1 text-center">
                  <div className="text-xs text-muted-foreground">Max Leverage</div>
                  <div className="text-2xl font-bold">
                    {metrics.maxLeverage !== null ? `${metrics.maxLeverage}x` : 'N/A'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 border rounded-lg bg-muted/30 text-center text-xs text-muted-foreground">
                Enter PE and SL to see calculated metrics
              </div>
            )}

            {/* Leverage Input - Below calculated metrics */}
            <div className="space-y-1 pt-1 border-t">
              <Label htmlFor="leverage" className="text-xs font-semibold">{t('calculator.leverageX')}</Label>
              <Input
                id="leverage"
                type="number"
                min="1"
                max="125"
                value={leverage}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) || e.target.value === '') setLeverage(v || 0);
                }}
                className="h-7 text-sm font-semibold"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Validation Errors - Compact */}
      {showResults && validationErrors.length > 0 && (
        <Card className="border-2 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-3 pb-3 px-3">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-destructive">{t('calculator.validationErrors')}</div>
                <ul className="text-xs text-destructive/90 space-y-0.5">
                  {validationErrors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Warnings - Compact */}
      {showResults && validationWarnings.length > 0 && (
        <Card className="border-2 border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-3 pb-3 px-3">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-yellow-600 dark:text-yellow-500">Warnings</div>
                <ul className="text-xs text-yellow-600/90 dark:text-yellow-500/90 space-y-0.5">
                  {validationWarnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results - Compact */}
      {showResults && metrics && (
        <Card className={isValid ? 'border-2 border-success/50 bg-success/5' : ''}>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm">{t('calculator.calculatedResults')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 space-y-3">
            {/* Primary Results - Compact Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">Margin</div>
                <div className="flex items-center gap-1.5">
                  <div className="text-lg font-bold">{formatCurrency(metrics.margin)}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleCopy(metrics.margin.toFixed(2), 'margin')}
                  >
                    {copied === 'margin' ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">Position</div>
                <div className="flex items-center gap-1.5">
                  <div className="text-lg font-bold">{formatCurrency(metrics.positionSize)}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleCopy(metrics.positionSize.toFixed(2), 'position')}
                  >
                    {copied === 'position' ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">Quantity</div>
                <div className="flex items-center gap-1.5">
                  <div className="text-lg font-bold">{metrics.quantity.toFixed(4)}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleCopy(metrics.quantity.toFixed(4), 'quantity')}
                  >
                    {copied === 'quantity' ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Secondary Results - Compact */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">1R</div>
                <div className="text-sm font-semibold">{formatCurrency(metrics.oneR)}</div>
              </div>

              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">
                  {validTps.length > 1 ? 'Weighted RR' : 'RR Ratio'}
                </div>
                <div className="text-sm font-semibold">{formatRR(metrics.plannedWeightedRR)}</div>
              </div>

              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase">Pot. Profit</div>
                <div className="text-sm font-semibold text-success">
                  {formatCurrency(metrics.potentialProfit)}
                </div>
              </div>
            </div>

            {/* Send to Journal Button - Compact */}
            {isValid && (
              <div className="pt-2 border-t">
                <Button
                  onClick={handleSendToJournal}
                  className="w-full h-8 text-xs"
                >
                  <ArrowRight className="h-3 w-3 mr-1.5" />
                  {t('calculator.sendToJournal')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
