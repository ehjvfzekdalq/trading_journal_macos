'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiCredentialSafe } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2, Trash2, Power, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExchangeCardProps {
  credential: ApiCredentialSafe;
  onTest: (id: string) => Promise<void>;
  onSync: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleActive: (id: string, isActive: boolean) => Promise<void>;
  isTesting: boolean;
}

export function ExchangeCard({
  credential,
  onTest,
  onSync,
  onDelete,
  onToggleActive,
  isTesting
}: ExchangeCardProps) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('api.confirmDelete'))) return;
    setIsDeleting(true);
    try {
      await onDelete(credential.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async () => {
    setIsToggling(true);
    try {
      await onToggleActive(credential.id, !credential.is_active);
    } finally {
      setIsToggling(false);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return t('api.never');
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getExchangeDisplayName = (exchange: string) => {
    const names: Record<string, string> = {
      bitget: 'BitGet',
      blofin: 'BloFin',
    };
    return names[exchange] || exchange.toUpperCase();
  };

  return (
    <Card className={!credential.is_active ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{getExchangeDisplayName(credential.exchange)}</CardTitle>
              {credential.is_active ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('api.active')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {t('api.inactive')}
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">{credential.label}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('api.apiKey')}</p>
              <p className="font-mono">{credential.api_key_preview}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('api.lastSync')}</p>
              <p>{formatDate(credential.last_sync_timestamp)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTest(credential.id)}
              disabled={isTesting || !credential.is_active}
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('api.testing')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('api.testConnection')}
                </>
              )}
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => onSync(credential.id)}
              disabled={!credential.is_active}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('api.syncNow')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleActive}
              disabled={isToggling}
            >
              {isToggling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              {credential.is_active ? t('api.deactivate') : t('api.activate')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
