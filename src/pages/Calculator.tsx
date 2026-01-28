import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Copy, Check, AlertCircle, Save, HelpCircle } from 'lucide-react';
import { calculateTradeMetrics } from '../lib/calculations';
import { formatCurrency, formatPercent, formatRR, formatLeverage } from '../lib/utils';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { api } from '../lib/api';

// Help tooltips component
const HelpTooltip = ({ title, content }: { title: string; content: string | JSX.Element }) => {
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

  // Step 1: Strategy Settings
  const [portfolio, setPortfolio] = useState(10000);
  const [rPercent, setRPercent] = useState(2);
  const [minRR, setMinRR] = useState(2);

  // Step 2: Trade Setup
  const [pe, setPe] = useState(200);
  const [sl, setSl] = useState(185);
  const [tp, setTp] = useState(230);

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
      setRPercent(settings.current_r_percent);
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
        current_r_percent: rPercent,
        default_min_rr: minRR,
        default_leverage: leverage,
      });
      alert(t('calculator.settingsSaved') || 'Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert(t('calculator.saveFailed') || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  let metrics = null;
  let isValid = false;
  let validationErrors: string[] = [];
  let showResults = false;

  try {
    if (pe && sl && tp && portfolio && rPercent) {
      metrics = calculateTradeMetrics({
        portfolio,
        rPercent: rPercent / 100,
        pe,
        sl,
        tps: [{ price: tp, percent: 1 }],
        leverage,
      });

      showResults = true;

      const rrCheck = metrics.tpsWithRR[0].rr >= minRR;
      const leverageCheck = leverage <= metrics.maxLeverage;

      if (!rrCheck) {
        validationErrors.push(`RR ratio (${metrics.tpsWithRR[0].rr.toFixed(2)}) is below minimum (${minRR})`);
      }
      if (!leverageCheck) {
        validationErrors.push(`Leverage (${leverage}x) exceeds max safe leverage (${metrics.maxLeverage}x)`);
      }

      isValid = rrCheck && leverageCheck;
    }
  } catch (error) {
    console.error('Calculation error:', error);
  }

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

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('calculator.title') || 'Position Calculator'}
        </h1>
        <p className="text-muted-foreground">
          Calculate your position size and risk-reward ratio
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
                title="Strategy Settings"
                content={
                  <div>
                    <p className="mb-2">Configure your risk management parameters:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Portfolio:</strong> Your total trading capital</li>
                      <li><strong>R%:</strong> Percentage of portfolio to risk per trade (typically 1-2%)</li>
                      <li><strong>Min RR:</strong> Minimum Risk:Reward ratio required (e.g., 2.0 means profit target is 2x your risk)</li>
                    </ul>
                    <p className="mt-2"><strong>Formula:</strong> 1R = Portfolio × R%</p>
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
            <CardTitle className="text-base">Trade Setup</CardTitle>
            <HelpTooltip
              title="Trade Setup"
              content={
                <div>
                  <p className="mb-2">Define your trade entry and exit points:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Entry (PE):</strong> Planned Entry price</li>
                    <li><strong>Stop Loss (SL):</strong> Price where you exit if wrong</li>
                    <li><strong>Take Profit (TP):</strong> Price target for profit</li>
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
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pe" className="text-xs">Entry (PE)</Label>
              <Input
                id="pe"
                type="number"
                step="0.01"
                value={pe}
                onChange={(e) => setPe(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl" className="text-xs">Stop Loss (SL)</Label>
              <Input
                id="sl"
                type="number"
                step="0.01"
                value={sl}
                onChange={(e) => setSl(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tp" className="text-xs">Take Profit (TP)</Label>
              <Input
                id="tp"
                type="number"
                step="0.01"
                value={tp}
                onChange={(e) => setTp(Number(e.target.value))}
                className="h-9 text-sm font-semibold"
              />
            </div>
          </div>

          {metrics && (
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Position:</span>
                <Badge variant={metrics.type === 'LONG' ? 'default' : 'destructive'}>
                  {metrics.type}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">SL Distance:</span>
                <span className="text-xs font-semibold">{formatPercent(metrics.distances.distanceSL_PCT)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Max Leverage:</span>
                <Badge variant={metrics.type === 'LONG' ? 'default' : 'destructive'} className="font-bold">
                  {metrics.maxLeverage}x
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
            <CardTitle className="text-base">Set your Leverage</CardTitle>
            <HelpTooltip
              title="Leverage Explained"
              content={
                <div>
                  <p className="mb-3 text-primary font-semibold italic">
                    {t('calculator.leverageNotRisk') || 'Leverage is not a risk multiplier but a capital management tool'}
                  </p>
                  <p className="mb-2">Leverage multiplies your position size:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Higher leverage</strong> = Larger position with same margin</li>
                    <li><strong>Max safe leverage</strong> = Calculated based on SL distance</li>
                    <li>Using more than max leverage risks liquidation before SL</li>
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
              <Label htmlFor="leverage" className="text-xs">Leverage (x)</Label>
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
                <div className="font-semibold text-sm text-destructive">Validation Errors</div>
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
              <CardTitle>Calculated Results</CardTitle>
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
                  <div className="text-xs text-muted-foreground">RR Ratio</div>
                  <div className="text-lg font-semibold">{formatRR(metrics.tpsWithRR[0].rr)}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Potential Profit</div>
                  <div className="text-lg font-semibold text-success">
                    {formatCurrency(metrics.potentialProfit)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
