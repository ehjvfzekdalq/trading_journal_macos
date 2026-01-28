import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function TradeNew() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Form state
  const [pair, setPair] = useState('');
  const [exchange, setExchange] = useState('');
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [portfolio, setPortfolio] = useState(10000);
  const [rPercent, setRPercent] = useState(2);
  const [minRR, setMinRR] = useState(2);
  const [pe, setPe] = useState(0);
  const [sl, setSl] = useState(0);
  const [leverage, setLeverage] = useState(10);
  const [tps, setTps] = useState([
    { price: 0, percent: 100 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
    { price: 0, percent: 0 },
  ]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setPortfolio(data.initial_capital);
      setRPercent(data.current_r_percent);
      setMinRR(data.default_min_rr);
      setLeverage(data.default_leverage);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  let metrics = null;
  let validation = { valid: false, errors: [] as string[] };

  try {
    if (pe && sl && tps.some(tp => tp.price > 0)) {
      const validTps = tps.filter(tp => tp.price > 0);
      const totalPercent = validTps.reduce((sum, tp) => sum + tp.percent, 0);

      validation.errors = [];

      if (Math.abs(totalPercent - 100) > 0.1) {
        validation.errors.push(`TP allocation (${totalPercent.toFixed(1)}%) must equal 100%`);
      }

      if (Math.abs(totalPercent - 100) <= 0.1) {
        const normalizedTps = validTps.map(tp => ({
          price: tp.price,
          percent: tp.percent / totalPercent
        }));

        metrics = calculateTradeMetrics({
          portfolio,
          rPercent: rPercent / 100,
          pe,
          sl,
          tps: normalizedTps,
          leverage,
        });

        if (metrics.plannedWeightedRR < minRR) {
          validation.errors.push(`RR (${metrics.plannedWeightedRR.toFixed(2)}) is below minimum (${minRR})`);
        }
        if (leverage > metrics.maxLeverage) {
          validation.errors.push(`Leverage (${leverage}x) exceeds max (${metrics.maxLeverage}x)`);
        }
      }

      validation.valid = validation.errors.length === 0;
    }
  } catch (error) {
    console.error('Calculation error:', error);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid || !metrics) return;

    if (metrics.type === 'UNDEFINED') {
      alert('Invalid trade setup: Take profit price cannot equal entry price');
      return;
    }

    setSaving(true);
    try {
      const plannedTpsJson = JSON.stringify(metrics.tpsWithRR.map(tp => ({
        price: tp.price,
        percent: tp.percent,
        rr: tp.rr,
      })));

      await api.createTrade({
        pair: pair.toUpperCase(),
        exchange,
        analysis_date: Math.floor(new Date(analysisDate).getTime() / 1000),
        trade_date: Math.floor(new Date(tradeDate).getTime() / 1000),
        status: 'OPEN',
        portfolio_value: portfolio,
        r_percent: rPercent / 100,
        min_rr: minRR,
        planned_pe: pe,
        planned_sl: sl,
        leverage,
        planned_tps: plannedTpsJson,
        position_type: metrics.type,
        one_r: metrics.oneR,
        margin: metrics.margin,
        position_size: metrics.positionSize,
        quantity: metrics.quantity,
        planned_weighted_rr: metrics.plannedWeightedRR,
        notes,
      });

      navigate('/journal');
    } catch (error) {
      console.error('Failed to create trade:', error);
      alert('Failed to create trade: ' + error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Trade</h1>
          <p className="text-muted-foreground">Create a new trade setup</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pair">Trading Pair *</Label>
              <Input
                id="pair"
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                placeholder="BTC/USDT"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exchange">Exchange *</Label>
              <Input
                id="exchange"
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                placeholder="Binance"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analysisDate">Analysis Date</Label>
              <Input
                id="analysisDate"
                type="date"
                value={analysisDate}
                onChange={(e) => setAnalysisDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradeDate">Trade Date</Label>
              <Input
                id="tradeDate"
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="portfolio">Portfolio ($)</Label>
              <Input
                id="portfolio"
                type="number"
                value={portfolio}
                onChange={(e) => setPortfolio(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rPercent">R% (Risk)</Label>
              <Input
                id="rPercent"
                type="number"
                step="0.1"
                value={rPercent}
                onChange={(e) => setRPercent(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minRR">Min RR</Label>
              <Input
                id="minRR"
                type="number"
                step="0.1"
                value={minRR}
                onChange={(e) => setMinRR(Number(e.target.value))}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Trade Setup */}
        <Card>
          <CardHeader>
            <CardTitle>Trade Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="pe">Entry (PE) *</Label>
                <Input
                  id="pe"
                  type="number"
                  step="0.00000001"
                  value={pe || ''}
                  onChange={(e) => setPe(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl">Stop Loss (SL) *</Label>
                <Input
                  id="sl"
                  type="number"
                  step="0.00000001"
                  value={sl || ''}
                  onChange={(e) => setSl(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leverage">Leverage</Label>
                <Input
                  id="leverage"
                  type="number"
                  min="1"
                  max="125"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  required
                />
              </div>
              {metrics && (
                <div className="space-y-2">
                  <Label>Position Type</Label>
                  <div className="h-10 flex items-center">
                    <Badge variant={metrics.type === 'LONG' ? 'default' : 'destructive'}>
                      {metrics.type}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {/* Take Profits */}
            <div className="space-y-3">
              <Label>Take Profits (at least one required)</Label>
              {tps.map((tp, index) => (
                <div key={index} className="grid gap-4 md:grid-cols-3 items-end">
                  <div className="space-y-2">
                    <Label htmlFor={`tp${index+1}-price`}>TP{index + 1} Price</Label>
                    <Input
                      id={`tp${index+1}-price`}
                      type="number"
                      step="0.00000001"
                      value={tp.price || ''}
                      onChange={(e) => {
                        const newTps = [...tps];
                        newTps[index].price = Number(e.target.value);
                        setTps(newTps);
                      }}
                      placeholder={index === 0 ? 'Required' : 'Optional'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`tp${index+1}-percent`}>Allocation (%)</Label>
                    <Input
                      id={`tp${index+1}-percent`}
                      type="number"
                      min="0"
                      max="100"
                      value={tp.percent || ''}
                      onChange={(e) => {
                        const newTps = [...tps];
                        newTps[index].percent = Number(e.target.value);
                        setTps(newTps);
                      }}
                      disabled={!tp.price}
                    />
                  </div>
                  {metrics && tp.price > 0 && (
                    <div className="space-y-2">
                      <Label>RR Ratio</Label>
                      <div className="h-10 flex items-center text-sm font-medium">
                        {formatRR(metrics.tpsWithRR.find(t => t.price === tp.price)?.rr || 0)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Calculated Results */}
        {metrics && (
          <Card className={validation.valid ? 'border-2 border-success/50' : 'border-2 border-destructive/50'}>
            <CardHeader>
              <CardTitle>Calculated Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">1R</div>
                  <div className="text-lg font-semibold">{formatCurrency(metrics.oneR)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Margin</div>
                  <div className="text-lg font-semibold">{formatCurrency(metrics.margin)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Position</div>
                  <div className="text-lg font-semibold">{formatCurrency(metrics.positionSize)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="text-lg font-semibold">{metrics.quantity.toFixed(4)}</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3 pt-2 border-t">
                <div>
                  <div className="text-xs text-muted-foreground">Weighted RR</div>
                  <div className="text-lg font-semibold">{formatRR(metrics.plannedWeightedRR)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max Leverage</div>
                  <div className="text-lg font-semibold">{metrics.maxLeverage}x</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Potential Profit</div>
                  <div className="text-lg font-semibold text-success">{formatCurrency(metrics.potentialProfit)}</div>
                </div>
              </div>

              {validation.errors.length > 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  <div className="space-y-1">
                    {validation.errors.map((error, i) => (
                      <div key={i} className="text-sm text-destructive">{error}</div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this trade setup..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/journal')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!validation.valid || saving}
          >
            {saving ? 'Creating...' : 'Create Trade'}
          </Button>
        </div>
      </form>
    </div>
  );
}
