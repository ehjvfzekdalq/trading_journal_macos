import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { api, type Settings } from '../lib/api';
import { calculateTradeMetrics } from '../lib/calculations';
import { formatCurrency, formatRR } from '../lib/utils';
import { ArrowLeft, AlertCircle, Calendar, TrendingUp, Copy } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';

export default function TradeNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

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
  const [plannedTps, setPlannedTps] = useState([
    { price: calculatorData?.tp || 0, percent: 100 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
  ]);

  // Form state - EXECUTION SECTION
  const [effectivePe, setEffectivePe] = useState(0);
  const [closeDate, setCloseDate] = useState('');
  const [exits, setExits] = useState([
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
  ]);

  // Unified notes
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      if (!calculatorData) {
        setPortfolio(data.initial_capital);
        setRPercent(data.current_r_percent);
        setMinRR(data.default_min_rr);
        setLeverage(data.default_leverage);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  // Calculate metrics for plan
  let planMetrics = null;
  let planValidation = { valid: false, errors: [] as string[] };

  try {
    if (plannedPe && plannedSl && plannedTps.some(tp => tp.price > 0)) {
      const validTps = plannedTps.filter(tp => tp.price > 0);
      const totalPercent = validTps.reduce((sum, tp) => sum + tp.percent, 0);

      planValidation.errors = [];

      if (Math.abs(totalPercent - 100) > 0.1) {
        planValidation.errors.push(`TP allocation (${totalPercent.toFixed(1)}%) must equal 100%`);
      }

      if (Math.abs(totalPercent - 100) <= 0.1) {
        const normalizedTps = validTps.map(tp => ({
          price: tp.price,
          percent: tp.percent / totalPercent
        }));

        planMetrics = calculateTradeMetrics({
          portfolio,
          rPercent: rPercent / 100,
          pe: plannedPe,
          sl: plannedSl,
          tps: normalizedTps,
          leverage,
        });

        if (planMetrics.plannedWeightedRR < minRR) {
          planValidation.errors.push(`RR (${planMetrics.plannedWeightedRR.toFixed(2)}) is below minimum (${minRR})`);
        }
        if (leverage > planMetrics.maxLeverage) {
          planValidation.errors.push(`Leverage (${leverage}x) exceeds max (${planMetrics.maxLeverage}x)`);
        }
      }

      planValidation.valid = planValidation.errors.length === 0;
    }
  } catch (error) {
    console.error('Calculation error:', error);
  }

  const handleCopyPlanToExecution = () => {
    setEffectivePe(plannedPe);
    // Copy TPs to exits with same structure
    const copiedExits = plannedTps.map(tp => ({
      price: tp.price,
      percent: tp.percent
    }));
    setExits(copiedExits);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planValidation.valid || !planMetrics) return;

    if (planMetrics.type === 'UNDEFINED') {
      alert(t('tradeNew.invalidSetup'));
      return;
    }

    setSaving(true);
    try {
      const plannedTpsJson = JSON.stringify(planMetrics.tpsWithRR.map(tp => ({
        price: tp.price,
        percent: tp.percent * 100,
        rr: tp.rr,
      })));

      // Prepare exits JSON if any exits are filled
      const validExits = exits.filter(e => e.price > 0);
      const exitsJson = validExits.length > 0 ? JSON.stringify(validExits) : null;


      await api.createTrade({
        pair: pair.toUpperCase(),
        exchange,
        analysis_date: Math.floor(new Date(analysisDate).getTime() / 1000),
        trade_date: Math.floor(new Date(tradeDate).getTime() / 1000),
        status: 'OPEN',
        portfolio_value: portfolio,
        r_percent: rPercent / 100,
        min_rr: minRR,
        planned_pe: plannedPe,
        planned_sl: plannedSl,
        leverage,
        planned_tps: plannedTpsJson,
        position_type: planMetrics.type,
        one_r: planMetrics.oneR,
        margin: planMetrics.margin,
        position_size: planMetrics.positionSize,
        quantity: planMetrics.quantity,
        planned_weighted_rr: planMetrics.plannedWeightedRR,
        notes,
      });

      navigate('/journal');
    } catch (error) {
      console.error('Failed to create trade:', error);
      alert(t('tradeNew.failedToCreate') + ': ' + error);
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
                      onChange={(e) => setPortfolio(Number(e.target.value))}
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
                      onChange={(e) => setRPercent(Number(e.target.value))}
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
                      onChange={(e) => setMinRR(Number(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Planned Setup */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeNew.plannedSetup')}</div>
                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="plannedPe" className="text-xs">{t('tradeNew.entryRequired')}</Label>
                    <Input
                      id="plannedPe"
                      type="number"
                      step="0.00000001"
                      value={plannedPe || ''}
                      onChange={(e) => setPlannedPe(Number(e.target.value))}
                      className="font-mono text-sm"
                      placeholder={t('tradeNew.pricePlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plannedSl" className="text-xs">{t('tradeNew.stopLossRequired')}</Label>
                    <Input
                      id="plannedSl"
                      type="number"
                      step="0.00000001"
                      value={plannedSl || ''}
                      onChange={(e) => setPlannedSl(Number(e.target.value))}
                      className="font-mono text-sm"
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
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      className={`text-sm ${planMetrics && leverage > planMetrics.maxLeverage ? 'border-destructive' : ''}`}
                    />
                    {planMetrics && (
                      <div className="text-xs space-y-1">
                        <div className="text-muted-foreground">
                          {t('tradeNew.maxSafe')}: {planMetrics.maxLeverage}x
                        </div>
                        {leverage > planMetrics.maxLeverage && (
                          <div className="text-destructive font-medium flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {t('tradeNew.leverageExceedsSafe')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Validation Warnings */}
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
              </div>

              {/* Planned Take Profits */}
              <div className="space-y-3 pt-3 border-t">
                <div className="text-sm font-semibold">{t('tradeNew.plannedTakeProfits')}</div>
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
                          newTps[index].price = Number(e.target.value);
                          setPlannedTps(newTps);
                        }}
                        placeholder={t('tradeNew.pricePlaceholder')}
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
                          newTps[index].percent = Number(e.target.value);
                          setPlannedTps(newTps);
                        }}
                        disabled={!tp.price}
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

              {/* Actual Entry & Close Date */}
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effectivePe" className="text-xs font-semibold">{t('tradeNew.actualEntry')}</Label>
                  <Input
                    id="effectivePe"
                    type="number"
                    step="0.00000001"
                    value={effectivePe || ''}
                    onChange={(e) => setEffectivePe(Number(e.target.value))}
                    className="font-mono"
                    placeholder={t('tradeNew.leaveEmptyNotExecuted')}
                  />
                  {plannedPe > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('tradeNew.plannedSetup')}: ${plannedPe.toFixed(8)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closeDate" className="text-xs font-semibold">{t('tradeDetail.closeDate')}</Label>
                  <Input
                    id="closeDate"
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('tradeDetail.closeDateOptional')}</p>
                </div>
              </div>

              {/* Actual Exits */}
              <div className="space-y-3">
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
                          {t('tradeNew.plannedSetup')}: {plannedTps[index].percent}% @ ${plannedTps[index].price.toFixed(8)}
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
                            const newExits = [...exits];
                            newExits[index].price = Number(e.target.value);
                            setExits(newExits);
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
                            newExits[index].percent = Number(e.target.value);
                            setExits(newExits);
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
