'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PreviewTrade {
  pair: string;
  position_type: string;
  entry_price: number;
  exit_price?: number;
  quantity: number;
  pnl: number;
  timestamp: number;
  is_duplicate: boolean;
}

interface SyncPreviewProps {
  trades: PreviewTrade[];
}

export function SyncPreview({ trades }: SyncPreviewProps) {
  const { t } = useTranslation();

  const newTrades = trades.filter(t => !t.is_duplicate);
  const duplicates = trades.filter(t => t.is_duplicate);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {t('api.newTrades')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newTrades.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              {t('api.duplicates')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duplicates.length}</div>
          </CardContent>
        </Card>
      </div>

      {trades.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t('api.previewTrades')}</h4>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {trades.map((trade, index) => (
              <Card key={index} className={trade.is_duplicate ? 'opacity-50' : ''}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={trade.position_type === 'LONG' ? 'default' : 'destructive'}>
                        {trade.position_type}
                      </Badge>
                      <span className="font-medium">{trade.pair}</span>
                      {trade.is_duplicate && (
                        <Badge variant="outline">{t('api.duplicate')}</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(trade.pnl)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(trade.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      Entry: {formatPrice(trade.entry_price)}
                    </div>
                    <div>
                      Exit: {trade.exit_price ? formatPrice(trade.exit_price) : '-'}
                    </div>
                    <div>
                      Qty: {trade.quantity}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
