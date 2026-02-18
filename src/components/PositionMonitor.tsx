import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Position, type ApiCredentialSafe } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CurrencyDisplay } from './CurrencyDisplay';

export function PositionMonitor() {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<Position[]>([]);
  const [credentials, setCredentials] = useState<ApiCredentialSafe[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(10); // seconds
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (selectedCredentialId && autoRefresh) {
      const interval = setInterval(() => {
        loadPositions(false);
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [selectedCredentialId, autoRefresh, refreshInterval]);

  const loadCredentials = async () => {
    try {
      const creds = await api.listApiCredentials();
      const activeCreds = creds.filter(c => c.is_active);
      setCredentials(activeCreds);

      // Auto-select first active credential
      if (activeCreds.length > 0 && !selectedCredentialId) {
        setSelectedCredentialId(activeCreds[0].id);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    }
  };

  const loadPositions = async (showLoading = true) => {
    if (!selectedCredentialId) return;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const fetchedPositions = await api.fetchCurrentPositions(selectedCredentialId);
      setPositions(fetchedPositions);
      setLastUpdate(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch positions';
      setError(errorMessage);
      console.error('Failed to load positions:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadPositions(true);
  };

  const handleCredentialChange = (credentialId: string) => {
    setSelectedCredentialId(credentialId);
    setPositions([]);
    setError(null);
  };

  const getLiquidationWarningColor = (distancePercent: number) => {
    if (distancePercent < 5) return 'text-destructive';
    if (distancePercent < 10) return 'text-orange-600 dark:text-orange-400';
    if (distancePercent < 20) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  };

  const getLiquidationBadgeVariant = (distancePercent: number): "default" | "destructive" | "outline" | "secondary" => {
    if (distancePercent < 5) return 'destructive';
    if (distancePercent < 10) return 'secondary';
    return 'outline';
  };

  const refreshIntervalOptions = [5, 10, 15, 30];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>{t('positionMonitor.title')}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {t('positionMonitor.lastUpdate', { time: lastUpdate.toLocaleTimeString() })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || !selectedCredentialId}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedCredentialId} onValueChange={handleCredentialChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('positionMonitor.selectCredential')} />
                </SelectTrigger>
                <SelectContent>
                  {credentials.map((cred) => (
                    <SelectItem key={cred.id} value={cred.id}>
                      {cred.label} ({cred.exchange})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">{t('positionMonitor.autoRefresh')}</label>
              <div className="flex gap-1">
                {refreshIntervalOptions.map((seconds) => (
                  <Button
                    key={seconds}
                    variant={autoRefresh && refreshInterval === seconds ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setRefreshInterval(seconds);
                      setAutoRefresh(true);
                    }}
                  >
                    {seconds}{t('positionMonitor.seconds')}
                  </Button>
                ))}
                <Button
                  variant={!autoRefresh ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAutoRefresh(false)}
                >
                  {t('positionMonitor.off')}
                </Button>
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => loadPositions(true)}
              disabled={!selectedCredentialId}
            >
              {t('positionMonitor.loadPositions')}
            </Button>
          </div>

          {/* Error State */}
          {error && (
            <div className="p-4 border border-destructive bg-destructive/10 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && positions.length === 0 && (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">{t('positionMonitor.loading')}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && positions.length === 0 && selectedCredentialId && (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mt-2">{t('positionMonitor.noPositions')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('positionMonitor.noPositionsHelp')}
              </p>
            </div>
          )}

          {/* No Credential Selected */}
          {!selectedCredentialId && credentials.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('positionMonitor.noCredentials')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('positionMonitor.noCredentialsHelp')}
              </p>
            </div>
          )}

          {/* Positions List */}
          {!loading && positions.length > 0 && (
            <div className="space-y-3">
              {positions.map((position) => {
                const isProfit = position.unrealized_pnl >= 0;
                const isLong = position.position_side === 'LONG';

                return (
                  <div
                    key={position.position_id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Symbol and Side */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{position.symbol}</h3>
                          <Badge variant={isLong ? 'default' : 'secondary'}>
                            {isLong ? (
                              <><TrendingUp className="h-3 w-3 mr-1" />{position.position_side}</>
                            ) : (
                              <><TrendingDown className="h-3 w-3 mr-1" />{position.position_side}</>
                            )}
                          </Badge>
                          <Badge variant="outline">{position.leverage}x</Badge>
                          <Badge variant="outline">{position.margin_mode}</Badge>
                        </div>

                        {/* Price Information */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('positionMonitor.entry')}</span>
                            <span className="font-medium">${position.entry_price.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('positionMonitor.current')}</span>
                            <span className="font-medium">${position.current_price.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('positionMonitor.quantity')}</span>
                            <span className="font-medium">{position.quantity.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('positionMonitor.margin')}</span>
                            <span className="font-medium"><CurrencyDisplay value={position.margin} /></span>
                          </div>
                        </div>
                      </div>

                      {/* Right: PnL and Liquidation */}
                      <div className="text-right space-y-2">
                        {/* Unrealized PnL */}
                        <div>
                          <div className={`text-2xl font-bold ${isProfit ? 'text-success' : 'text-destructive'}`}>
                            <CurrencyDisplay value={position.unrealized_pnl} />
                          </div>
                          <div className={`text-sm font-medium ${isProfit ? 'text-success' : 'text-destructive'}`}>
                            {position.unrealized_pnl_percent >= 0 ? '+' : ''}
                            {position.unrealized_pnl_percent.toFixed(2)}%
                          </div>
                        </div>

                        {/* Liquidation Warning */}
                        <div>
                          <div className="text-xs text-muted-foreground">{t('positionMonitor.liquidation')}</div>
                          <div className="text-sm font-medium">
                            ${position.liquidation_price.toFixed(4)}
                          </div>
                          <Badge
                            variant={getLiquidationBadgeVariant(position.price_distance_to_liquidation_percent)}
                            className="mt-1"
                          >
                            {position.price_distance_to_liquidation_percent < 5 && (
                              <AlertTriangle className="h-3 w-3 mr-1" />
                            )}
                            <span className={getLiquidationWarningColor(position.price_distance_to_liquidation_percent)}>
                              {position.price_distance_to_liquidation_percent.toFixed(2)}{t('positionMonitor.percentAway')}
                            </span>
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {positions.length > 0 && (
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {t('positionMonitor.totalPositions', { count: positions.length })}
                </span>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">{t('positionMonitor.totalUnrealizedPnL')}</div>
                  <div className={`text-lg font-bold ${
                    positions.reduce((sum, p) => sum + p.unrealized_pnl, 0) >= 0
                      ? 'text-success'
                      : 'text-destructive'
                  }`}>
                    <CurrencyDisplay value={positions.reduce((sum, p) => sum + p.unrealized_pnl, 0)} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
