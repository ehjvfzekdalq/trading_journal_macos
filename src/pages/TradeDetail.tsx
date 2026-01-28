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
import { ArrowLeft, Copy, Trash2, AlertCircle } from 'lucide-react';

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
      let realizedPnl = null;
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
          realizedPnl = metrics.realizedPnl;
          effectiveRR = metrics.effectiveRR;
          newStatus = metrics.totalPnl >= 0 ? 'WIN' : 'LOSS';
        } else if (totalExitPercent > 0) {
          // Partial exit
          const normalizedExits = validExits.map(e => ({
            price: e.price,
            percent: e.percent / 100, // Keep as actual percent for partial
          }));

          const metrics = calculateExecutionMetrics({
            pe: effectivePe,
            sl: trade.planned_sl,
            exits: normalizedExits,
            oneR: trade.one_r,
            positionSize: trade.position_size,
            type: trade.position_type,
          });

          realizedPnl = metrics.realizedPnl;
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
        realized_pnl: realizedPnl,
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{trade.pair}</h1>
              <Badge variant={
                trade.status === 'WIN' ? 'default' :
                trade.status === 'LOSS' ? 'destructive' :
                trade.status === 'BREAKEVEN' ? 'secondary' :
                'outline'
              }>
                {trade.status}
              </Badge>
              <Badge variant={trade.position_type === 'LONG' ? 'default' : 'destructive'}>
                {trade.position_type}
              </Badge>
            </div>
            <p className="text-muted-foreground">{trade.exchange}</p>
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

      {/* Trade Plan - Read Only */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Analysis Date</div>
              <div className="text-sm font-medium">
                {new Date(trade.analysis_date * 1000).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Trade Date</div>
              <div className="text-sm font-medium">
                {new Date(trade.trade_date * 1000).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Portfolio Value</div>
              <div className="text-sm font-medium">{formatCurrency(trade.portfolio_value)}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Planned Entry (PE)</div>
              <div className="text-sm font-medium">{trade.planned_pe.toFixed(8)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Stop Loss (SL)</div>
              <div className="text-sm font-medium">{trade.planned_sl.toFixed(8)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Leverage</div>
              <div className="text-sm font-medium">{trade.leverage}x</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">R% Risk</div>
              <div className="text-sm font-medium">{formatPercent(trade.r_percent)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Planned Take Profits</div>
            <div className="grid gap-2">
              {plannedTps.map((tp: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm border rounded-lg p-2">
                  <div className="font-medium">TP{index + 1}</div>
                  <div>{tp.price.toFixed(8)}</div>
                  <div>{tp.percent.toFixed(1)}%</div>
                  <div className="text-muted-foreground">RR: {formatRR(tp.rr)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4 pt-3 border-t">
            <div>
              <div className="text-xs text-muted-foreground">1R</div>
              <div className="text-lg font-semibold">{formatCurrency(trade.one_r)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Margin</div>
              <div className="text-lg font-semibold">{formatCurrency(trade.margin)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Position Size</div>
              <div className="text-lg font-semibold">{formatCurrency(trade.position_size)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Quantity</div>
              <div className="text-lg font-semibold">{trade.quantity.toFixed(4)}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Planned Weighted RR</div>
              <div className="text-lg font-semibold">{formatRR(trade.planned_weighted_rr)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Min RR Required</div>
              <div className="text-lg font-semibold">{formatRR(trade.min_rr)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trade Execution - Editable */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Execution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="effectivePe">Effective Entry Price</Label>
              <Input
                id="effectivePe"
                type="number"
                step="0.00000001"
                value={effectivePe || ''}
                onChange={(e) => setEffectivePe(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeDate">Close Date (Optional)</Label>
              <Input
                id="closeDate"
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Exits (leave price at 0 if not taken)</Label>
            {exits.map((exit, index) => (
              <div key={index} className="grid gap-4 md:grid-cols-3 items-end">
                <div className="space-y-2">
                  <Label htmlFor={`exit${index}-price`}>Exit {index + 1} Price</Label>
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
                    placeholder="Not taken"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`exit${index}-percent`}>Position Closed (%)</Label>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allocation</Label>
                  <div className="h-10 flex items-center text-sm text-muted-foreground">
                    {plannedTps[index] ? `${plannedTps[index].percent.toFixed(1)}% planned` : '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {validExits.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                Total position closed: <span className="font-semibold">{totalExitPercent.toFixed(1)}%</span>
                {Math.abs(totalExitPercent - 100) <= 0.1 ? (
                  <span className="text-success ml-2">✓ Trade complete</span>
                ) : totalExitPercent > 100 ? (
                  <span className="text-destructive ml-2">⚠ Exceeds 100%</span>
                ) : (
                  <span className="text-warning ml-2">Partial exit</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="executionNotes">Execution Notes</Label>
            <Textarea
              id="executionNotes"
              value={executionNotes}
              onChange={(e) => setExecutionNotes(e.target.value)}
              placeholder="Add notes about how the trade played out..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Execution Results */}
      {executionValid && executionMetrics && (
        <Card className="border-2 border-primary/50">
          <CardHeader>
            <CardTitle>Execution Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Realized P&L</div>
                <div className={`text-2xl font-bold ${
                  executionMetrics.realizedPnl >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {formatCurrency(executionMetrics.realizedPnl)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total P&L (if complete)</div>
                <div className={`text-2xl font-bold ${
                  executionMetrics.totalPnl >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {formatCurrency(executionMetrics.totalPnl)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Effective RR</div>
                <div className="text-2xl font-bold">
                  {formatRR(executionMetrics.effectiveRR)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Planned RR</div>
                <div className="text-lg font-semibold">{formatRR(trade.planned_weighted_rr)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">RR Performance</div>
                <div className={`text-lg font-semibold ${
                  executionMetrics.effectiveRR >= trade.planned_weighted_rr
                    ? 'text-success'
                    : 'text-warning'
                }`}>
                  {executionMetrics.effectiveRR >= trade.planned_weighted_rr
                    ? '✓ Met or exceeded plan'
                    : '⚠ Below planned RR'
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          onClick={() => navigate('/journal')}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
