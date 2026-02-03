import { useEffect, useState } from 'react';
import { api, type OpenOrder, type ApiCredentialSafe } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { RefreshCw, Search, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

export default function OpenOrders() {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [credentials, setCredentials] = useState<ApiCredentialSafe[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSide, setFilterSide] = useState<string>('all');
  const [filterOrderType, setFilterOrderType] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (autoRefresh && selectedCredential) {
      const interval = setInterval(() => {
        loadOrders();
      }, 30000); // Refresh every 30 seconds
      setAutoRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      setAutoRefreshInterval(null);
    }
  }, [autoRefresh, selectedCredential]);

  const loadCredentials = async () => {
    try {
      const creds = await api.listApiCredentials();
      setCredentials(creds);
      if (creds.length > 0 && !selectedCredential) {
        setSelectedCredential(creds[0].id);
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      toast.error('Failed to load API credentials');
    }
  };

  const loadOrders = async () => {
    if (!selectedCredential) {
      toast.error('Please select an API credential');
      return;
    }

    setLoading(true);
    try {
      const fetchedOrders = await api.fetchOpenOrders({
        credential_id: selectedCredential,
        symbol: searchTerm || undefined,
      });
      setOrders(fetchedOrders);
      toast.success(`Loaded ${fetchedOrders.length} open orders`);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error(`Failed to load orders: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const getOrderAge = (createdAt: number): string => {
    const now = Date.now();
    const ageMs = now - createdAt;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) return `${ageDays}d`;
    if (ageHours > 0) return `${ageHours}h`;
    if (ageMinutes > 0) return `${ageMinutes}m`;
    return 'Just now';
  };

  const getFillPercentage = (order: OpenOrder): number => {
    const size = parseFloat(order.size);
    const filledSize = parseFloat(order.filled_size);
    if (size === 0) return 0;
    return (filledSize / size) * 100;
  };

  const filteredOrders = orders.filter(order => {
    if (searchTerm && !order.symbol.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterSide !== 'all' && order.side !== filterSide) {
      return false;
    }
    if (filterOrderType !== 'all' && order.order_type !== filterOrderType) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Open Orders</h1>
          <p className="text-muted-foreground">
            Track your pending orders in real-time
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Credential Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">API Credential</label>
              <select
                value={selectedCredential}
                onChange={(e) => setSelectedCredential(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                {credentials.map(cred => (
                  <option key={cred.id} value={cred.id}>
                    {cred.label} ({cred.exchange})
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Symbol</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g., BTCUSDT"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Filter Side */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Side</label>
              <select
                value={filterSide}
                onChange={(e) => setFilterSide(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">All Sides</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Filter Order Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Order Type</label>
              <select
                value={filterOrderType}
                onChange={(e) => setFilterOrderType(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">All Types</option>
                <option value="limit">Limit</option>
                <option value="market">Market</option>
              </select>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex gap-2">
                <Button
                  onClick={loadOrders}
                  disabled={loading || !selectedCredential}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant={autoRefresh ? 'default' : 'outline'}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="px-3"
                  title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh (30s)'}
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pending Orders ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && orders.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {orders.length === 0
                  ? 'No pending orders found. Click Refresh to load orders.'
                  : 'No orders match the current filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Symbol</th>
                    <th className="text-left p-3 font-medium">Side</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Price</th>
                    <th className="text-right p-3 font-medium">Size</th>
                    <th className="text-right p-3 font-medium">Filled</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const fillPct = getFillPercentage(order);
                    return (
                      <tr key={order.order_id} className="border-b hover:bg-accent/50">
                        <td className="p-3">
                          <div className="font-medium">{order.symbol}</div>
                          {order.pos_side && (
                            <div className="text-xs text-muted-foreground">
                              {order.pos_side}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className={`flex items-center gap-1 ${
                            order.side === 'buy' ? 'text-success' : 'text-destructive'
                          }`}>
                            {order.side === 'buy' ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                            <span className="uppercase font-medium">{order.side}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-1 rounded-md bg-accent text-xs uppercase">
                            {order.order_type}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${parseFloat(order.price).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {parseFloat(order.size).toFixed(4)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-mono">
                            {parseFloat(order.filled_size).toFixed(4)}
                          </div>
                          {fillPct > 0 && (
                            <div className="text-xs text-muted-foreground">
                              ({fillPct.toFixed(1)}%)
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-md text-xs ${
                            order.status === 'new' ? 'bg-blue-500/10 text-blue-500' :
                            order.status === 'partial_fill' ? 'bg-yellow-500/10 text-yellow-500' :
                            'bg-accent'
                          }`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-center text-sm text-muted-foreground">
                          {getOrderAge(order.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
