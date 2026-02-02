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
  const entriesManager = useEntryManager([{ price: 200, percent: 100 }]);
  const { entries, add: addEntry, remove: removeEntry, update: updateEntry } = entriesManager;

  const [sl, setSl] = useState(185);

  // Multiple Take Profits (using custom hook)
  const tpsManager = useEntryManager([{ price: 230, percent: 100 }]);
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
          validationErrors.push(`Weighted RR (${weightedRR.toFixed(2)}) is below minimum (${minRR})`);
        }
        if (!leverageCheck) {
          validationErrors.push(`Leverage (${leverage}x) exceeds max safe leverage (${metrics.maxLeverage}x)`);
        }

        isValid = rrCheck && leverageCheck && entryValidation.valid && tpValidation.valid;
      }
    } catch (error) {
      console.error('Calculation error:', error);
    }

    return { metrics, isValid, validationErrors, showResults, validEntries, validTps };
  }, [entries, tps, sl, portfolio, rPercent, minRR, leverage]);

  const { metrics, isValid, validationErrors, showResults, validEntries, validTps } = calculationResult;

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
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          {t('calculator.title') || 'Position Calculator'}
          <HelpBadge section="calculator" />
        </h1>
        <p className="text-muted-foreground">
          {t('calculator.subtitle')}
        </p>
      </div>

      {/* STEP 1: Strategy Settings */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
                1
              </div>
              <CardTitle className="text-base">
                {t('calculator.strategySettings') || 'Strategy Settings'}
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveSettings}
              disabled={saving}
              className="h-7 text-xs"
            >
              <Save className="h-3 w-3 mr-1.5" />
              {saving ? (t('calculator.saving') || 'Saving...') : (t('calculator.saveSettings') || 'Save')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio" className="text-xs">
                {t('calculator.portfolio') || 'Portfolio ($)'}
              </Label>
              <Input
                id="portfolio"
                type="number"
                value={portfolio}
                onChange={(e) => setPortfolio(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rPercent" className="text-xs">
                {t('calculator.rPercent') || 'R %'}
              </Label>
              <Input
                id="rPercent"
                type="number"
                step="0.1"
                value={rPercent}
                onChange={(e) => setRPercent(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minRR" className="text-xs">
                {t('calculator.minRR') || 'Min RR'}
              </Label>
              <Input
                id="minRR"
                type="number"
                step="0.1"
                value={minRR}
                onChange={(e) => setMinRR(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STEP 2: Trade Setup */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
              2
            </div>
            <CardTitle className="text-base">{t('calculator.tradeSetup')}</CardTitle>
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
        <CardContent className="space-y-4 pt-0">
          {/* Multiple Entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                {t('calculator.entry') || 'Entry Prices'}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEntry}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Entry
              </Button>
            </div>

            {entries.map((entry, index) => (
              <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">Entry {index + 1}</Badge>
                  {entries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <Label htmlFor={`entry${index}-price`} className="text-xs">
                      Price {index === 0 && '*'}
                    </Label>
                    <Input
                      id={`entry${index}-price`}
                      type="number"
                      step="0.00000001"
                      value={entry.price || ''}
                      onChange={(e) => updateEntry(index, 'price', Number(e.target.value))}
                      placeholder="0.00"
                      className="font-mono text-sm h-8"
                      required={index === 0}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`entry${index}-percent`} className="text-xs">
                      Allocation %
                    </Label>
                    <Input
                      id={`entry${index}-percent`}
                      type="number"
                      min="0"
                      max="100"
                      value={entry.percent || ''}
                      onChange={(e) => updateEntry(index, 'percent', Number(e.target.value))}
                      disabled={!entry.price}
                      placeholder="0"
                      className="text-sm h-8"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Entry Allocation Summary */}
            {(() => {
              const validEntries = entries.filter(e => e.price > 0);
              const totalPercent = validEntries.reduce((sum, e) => sum + e.percent, 0);
              const isValid = Math.abs(totalPercent - 100) <= 0.1;

              return validEntries.length > 0 && (
                <div className={cn(
                  "p-3 rounded-lg border text-sm",
                  isValid
                    ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
                    : "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total Entry Allocation:</span>
                    <span className="font-bold">{totalPercent.toFixed(1)}%</span>
                  </div>
                  {!isValid && (
                    <p className="text-xs mt-1 opacity-90">Must equal 100%</p>
                  )}
                </div>
              );
            })()}

            {/* Weighted Average Entry */}
            <WeightedEntryDisplay entries={validEntries} />
          </div>

          {/* Stop Loss */}
          <div className="space-y-1.5 pt-3 border-t">
            <Label htmlFor="sl" className="text-sm font-semibold">{t('calculator.stopLoss')}</Label>
            <Input
              id="sl"
              type="number"
              step="0.00000001"
              value={sl}
              onChange={(e) => setSl(Number(e.target.value))}
              className="font-mono text-sm h-9"
              placeholder="0.00"
            />
          </div>

          {/* Multiple Take Profits */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                {t('calculator.takeProfit') || 'Take Profit Levels'}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTp}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add TP
              </Button>
            </div>

            {tps.map((tp, index) => (
              <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">TP {index + 1}</Badge>
                  {tps.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTp(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <Label htmlFor={`tp${index}-price`} className="text-xs">
                      Price {index === 0 && '*'}
                    </Label>
                    <Input
                      id={`tp${index}-price`}
                      type="number"
                      step="0.00000001"
                      value={tp.price || ''}
                      onChange={(e) => updateTp(index, 'price', Number(e.target.value))}
                      placeholder="0.00"
                      className="font-mono text-sm h-8"
                      required={index === 0}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`tp${index}-percent`} className="text-xs">
                      Allocation %
                    </Label>
                    <Input
                      id={`tp${index}-percent`}
                      type="number"
                      min="0"
                      max="100"
                      value={tp.percent || ''}
                      onChange={(e) => updateTp(index, 'percent', Number(e.target.value))}
                      disabled={!tp.price}
                      placeholder="0"
                      className="text-sm h-8"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* TP Allocation Summary */}
            {(() => {
              const validTps = tps.filter(tp => tp.price > 0);
              const totalPercent = validTps.reduce((sum, tp) => sum + tp.percent, 0);
              const isValid = Math.abs(totalPercent - 100) <= 0.1;

              return validTps.length > 0 && (
                <div className={cn(
                  "p-3 rounded-lg border text-sm",
                  isValid
                    ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
                    : "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total TP Allocation:</span>
                    <span className="font-bold">{totalPercent.toFixed(1)}%</span>
                  </div>
                  {!isValid && (
                    <p className="text-xs mt-1 opacity-90">Must equal 100%</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Position Info */}
          {metrics && (
            <div className="flex items-center gap-4 pt-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('calculator.positionType')}:</span>
                <Badge variant={metrics.type === 'LONG' ? 'default' : 'destructive'}>
                  {metrics.type}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('calculator.slDistance')}:</span>
                <span className="text-xs font-semibold">{formatPercent(metrics.distances.distanceSL_PCT)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('calculator.maxLeverage')}:</span>
                <Badge variant={metrics.type === 'LONG' ? 'default' : 'destructive'} className="font-bold">
                  {metrics.maxLeverage !== null ? `${metrics.maxLeverage}x` : 'N/A'}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* STEP 3: Leverage */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
              3
            </div>
            <CardTitle className="text-base">{t('calculator.setLeverage')}</CardTitle>
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
                  <div className="mt-3 p-2 bg-muted/50 rounded text-xs font-mono space-y-1">
                    <div>Margin = Position Size / Leverage</div>
                    <div>Position = 1R × Leverage / SL%</div>
                    <div>Quantity = Position / Entry Price</div>
                  </div>
                </div>
              }
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="leverage" className="text-xs">{t('calculator.leverageX')}</Label>
              <Input
                id="leverage"
                type="number"
                min="1"
                max="125"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {showResults && validationErrors.length > 0 && (
        <Card className="border-2 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-sm text-destructive">{t('calculator.validationErrors')}</div>
                <ul className="text-sm text-destructive/90 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {showResults && metrics && (
        <>
          <Card className={isValid ? 'border-2 border-success/50 bg-success/5' : ''}>
            <CardHeader>
              <CardTitle>{t('calculator.calculatedResults')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary Results */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Margin</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-bold">{formatCurrency(metrics.margin)}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
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

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Position</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-bold">{formatCurrency(metrics.positionSize)}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
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

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-bold">{metrics.quantity.toFixed(4)}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
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

              {/* Secondary Results */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">1R</div>
                  <div className="text-lg font-semibold">{formatCurrency(metrics.oneR)}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {validTps.length > 1 ? 'Weighted RR' : 'RR Ratio'}
                  </div>
                  <div className="text-lg font-semibold">{formatRR(metrics.plannedWeightedRR)}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Potential Profit</div>
                  <div className="text-lg font-semibold text-success">
                    {formatCurrency(metrics.potentialProfit)}
                  </div>
                </div>
              </div>

              {/* Send to Journal Button */}
              {isValid && (
                <div className="pt-4 border-t">
                  <Button
                    onClick={handleSendToJournal}
                    className="w-full"
                    size="lg"
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {t('calculator.sendToJournal')}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {t('calculator.createNewTradeEntry')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
