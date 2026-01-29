import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { api, type Trade } from '../lib/api';
import { calculateExecutionMetrics } from '../lib/calculations';
import { formatCurrency, formatRR, formatPercent } from '../lib/utils';
import { ArrowLeft, Copy, Trash2, AlertCircle, TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';

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

  // Editable execution fields
  const [effectivePe, setEffectivePe] = useState(0);
  const [exits, setExits] = useState<Exit[]>([]);
  const [closeDate, setCloseDate] = useState('');
  const [executionNotes, setExecutionNotes] = useState('');

  useEffect(() => {
    if (id) {
      loadTrade(id);
    }
  }, [id]);

  const loadTrade = async (tradeId: string) => {
    try {
      const data = await api.getTrade(tradeId);
      setTrade(data);

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
        const plannedTps = typeof data.planned_tps === 'string'
          ? JSON.parse(data.planned_tps)
          : data.planned_tps;
        setExits(plannedTps.map(() => ({ price: 0, percent: 0 })));
      }

      if (data.close_date) {
        setCloseDate(new Date(data.close_date * 1000).toISOString().split('T')[0]);
      }

      setExecutionNotes(data.notes || '');
    } catch (error) {
      console.error('Failed to load trade:', error);
      alert('Failed to load trade');
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

      if (validExits.length > 0) {
        const totalExitPercent = validExits.reduce((sum, e) => sum + e.percent, 0);

        if (Math.abs(totalExitPercent - 100) <= 0.1) {
          // All position closed
          const normalizedExits = validExits.map(e => ({
            price: e.price,
            percent: e.percent / totalExitPercent,
          }));

          const metrics = calculateExecutionMetrics({
            pe: effectivePe,
            sl: trade.planned_sl,
            exits: normalizedExits,
            oneR: trade.one_r,
            positionSize: trade.position_size,
            type: trade.position_type,
          });

          totalPnl = metrics.totalPnl;
          effectiveRR = metrics.effectiveRR;
          newStatus = metrics.totalPnl >= 0 ? 'WIN' : 'LOSS';
        } else if (totalExitPercent > 0) {
          // Partial exit
          const normalizedExits = validExits.map(e => ({
            price: e.price,
            percent: e.percent / 100,
          }));

          const metrics = calculateExecutionMetrics({
            pe: effectivePe,
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

      await api.updateTrade(trade.id, {
        effective_pe: effectivePe,
        exits: exitsJson,
        close_date: closeDateTimestamp,
        total_pnl: totalPnl,
        effective_rr: effectiveRR,
        status: newStatus,
        notes: executionNotes,
      });

      alert('Trade updated successfully');
      navigate('/journal');
    } catch (error) {
      console.error('Failed to update trade:', error);
      alert('Failed to update trade: ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!trade) return;

    if (confirm('Clone this trade setup? (Execution data will be reset)')) {
      try {
        const newTrade = await api.duplicateTrade(trade.id);
        navigate(`/journal/${newTrade.id}`);
        alert('Trade duplicated successfully');
      } catch (error) {
        console.error('Failed to duplicate trade:', error);
        alert('Failed to duplicate trade: ' + error);
      }
    }
  };

  const handleDelete = async () => {
    if (!trade) return;

    if (confirm('Are you sure you want to delete this trade? This cannot be undone.')) {
      try {
        await api.deleteTrade(trade.id);
        alert('Trade deleted successfully');
        navigate('/journal');
      } catch (error) {
        console.error('Failed to delete trade:', error);
        alert('Failed to delete trade: ' + error);
      }
    }
  };

  const handleCopyPlanToExecution = () => {
    if (!trade) return;

    // Copy planned entry to actual entry
    setEffectivePe(trade.planned_pe);

    // Parse planned TPs and copy to exits
    const plannedTps = typeof trade.planned_tps === 'string'
      ? JSON.parse(trade.planned_tps)
      : trade.planned_tps;

    const copiedExits = plannedTps.map((tp: any) => ({
      price: tp.price,
      percent: tp.percent
    }));
    setExits(copiedExits);
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!trade) {
    return <div className="text-destructive">Trade not found</div>;
  }

  // Parse planned TPs
  const plannedTps = typeof trade.planned_tps === 'string'
    ? JSON.parse(trade.planned_tps)
    : trade.planned_tps;

  // Calculate current metrics
  const validExits = exits.filter(e => e.price > 0);
  const totalExitPercent = validExits.reduce((sum, e) => sum + e.percent, 0);
  let executionMetrics = null;
  let executionValid = false;

  if (validExits.length > 0 && totalExitPercent > 0) {
    const normalizedExits = validExits.map(e => ({
      price: e.price,
      percent: e.percent / 100,
    }));

    executionMetrics = calculateExecutionMetrics({
      pe: effectivePe,
      sl: trade.planned_sl,
      exits: normalizedExits,
      oneR: trade.one_r,
      positionSize: trade.position_size,
      type: trade.position_type,
    });

    executionValid = true;
  }

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
            Duplicate
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Portfolio Value</p>
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
                <p className="text-xs text-muted-foreground">Risk (1R)</p>
                <p className="text-2xl font-bold">{formatCurrency(trade.one_r)}</p>
                <p className="text-xs text-muted-foreground">{formatPercent(trade.r_percent)} risk</p>
              </div>
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Planned RR</p>
                <p className="text-2xl font-bold">{formatRR(trade.planned_weighted_rr)}</p>
                <p className="text-xs text-muted-foreground">Min: {formatRR(trade.min_rr)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Actual P&L</p>
                <p className={`text-2xl font-bold ${
                  trade.total_pnl
                    ? (trade.total_pnl >= 0 ? 'text-green-500' : 'text-red-500')
                    : ''
                }`}>
                  {trade.total_pnl ? formatCurrency(trade.total_pnl) : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {trade.effective_weighted_rr ? `${formatRR(trade.effective_weighted_rr)} RR` : 'Not closed'}
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
        {/* Left Column: Trade Plan (Read-Only) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-muted/50">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Trade Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Dates */}
              <div className="grid gap-3 grid-cols-2">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Analysis Date</div>
                  <div className="text-sm font-semibold">
                    {new Date(trade.analysis_date * 1000).toLocaleDateString()}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Trade Date</div>
                  <div className="text-sm font-semibold">
                    {new Date(trade.trade_date * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Entry & Stop Loss */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                  <div>
                    <div className="text-xs text-muted-foreground">Planned Entry (PE)</div>
                    <div className="text-lg font-bold">${trade.planned_pe.toFixed(8)}</div>
                  </div>
                  <Badge variant="outline">{trade.leverage}x Leverage</Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
                  <div>
                    <div className="text-xs text-muted-foreground">Stop Loss (SL)</div>
                    <div className="text-lg font-bold">${trade.planned_sl.toFixed(8)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Distance</div>
                    <div className="text-sm font-semibold">
                      {Math.abs(((trade.planned_pe - trade.planned_sl) / trade.planned_pe) * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Take Profits */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Planned Take Profits</div>
                <div className="space-y-2">
                  {plannedTps.map((tp: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-12 justify-center">TP{index + 1}</Badge>
                        <div>
                          <div className="text-sm font-semibold">${tp.price?.toFixed(8) || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {tp.percent != null ? `${tp.percent.toFixed(1)}% of position` : '-'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">RR</div>
                        <div className="text-sm font-semibold">{tp.rr != null ? formatRR(tp.rr) : '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Position Details */}
              <div className="pt-3 border-t space-y-2">
                <div className="text-sm font-semibold mb-3">Position Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Position Size</div>
                    <div className="text-sm font-semibold">{formatCurrency(trade.position_size)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Quantity</div>
                    <div className="text-sm font-semibold">{trade.quantity.toFixed(4)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Margin</div>
                    <div className="text-sm font-semibold">{formatCurrency(trade.margin)}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Leverage</div>
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
                  Trade Execution
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPlanToExecution}
                  disabled={!trade}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Actual Entry & Close Date */}
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effectivePe" className="text-xs font-semibold">Actual Entry Price</Label>
                  <Input
                    id="effectivePe"
                    type="number"
                    step="0.00000001"
                    value={effectivePe || ''}
                    onChange={(e) => setEffectivePe(Number(e.target.value))}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Planned: ${trade.planned_pe.toFixed(8)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closeDate" className="text-xs font-semibold">Close Date</Label>
                  <Input
                    id="closeDate"
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Optional</p>
                </div>
              </div>

              {/* Exit Points */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Exit Points</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Enter actual exit prices and % of position closed. Leave price at 0 if not taken yet.
                </p>

                {exits.map((exit, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Exit {index + 1}</Badge>
                      {plannedTps[index]?.percent != null && (
                        <span className="text-xs text-muted-foreground">
                          Planned: {plannedTps[index].percent.toFixed(1)}% @ ${plannedTps[index].price?.toFixed(8)}
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`exit${index}-price`} className="text-xs">Exit Price</Label>
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
                          placeholder="0.00000000"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`exit${index}-percent`} className="text-xs">% Closed</Label>
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
                          placeholder="0"
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
                      <div className="text-sm font-semibold">Position Closed</div>
                      <div className="text-2xl font-bold">{totalExitPercent.toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      {Math.abs(totalExitPercent - 100) <= 0.1 ? (
                        <Badge variant="default" className="bg-green-500">✓ Complete</Badge>
                      ) : totalExitPercent > 100 ? (
                        <Badge variant="destructive">⚠ Over 100%</Badge>
                      ) : (
                        <Badge variant="secondary">Partial Exit</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Notes */}
              <div className="space-y-2">
                <Label htmlFor="executionNotes" className="text-sm font-semibold">Execution Notes</Label>
                <Textarea
                  id="executionNotes"
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                  placeholder="How did the trade play out? What did you learn?"
                  rows={4}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Live Results Preview */}
          {executionValid && executionMetrics && (
            <Card className="border-2 border-primary">
              <CardHeader className="bg-primary/10">
                <CardTitle className="text-lg">Live Results</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Realized P&L</div>
                    <div className={`text-3xl font-bold ${
                      executionMetrics.realizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {formatCurrency(executionMetrics.realizedPnl)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
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
                      <div className="text-xs text-muted-foreground">Effective RR</div>
                      <div className="text-2xl font-bold">{formatRR(executionMetrics.effectiveRR)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">vs Planned</div>
                      <div className={`text-lg font-semibold ${
                        executionMetrics.effectiveRR >= trade.planned_weighted_rr
                          ? 'text-green-500'
                          : 'text-yellow-500'
                      }`}>
                        {executionMetrics.effectiveRR >= trade.planned_weighted_rr
                          ? '✓ Exceeded'
                          : '△ Below Plan'
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

      {/* Save Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Save changes to update the trade in your journal
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/journal')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="lg"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
