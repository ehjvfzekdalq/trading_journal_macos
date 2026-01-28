'use client';

import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SyncProgressProps {
  status: 'idle' | 'syncing' | 'success' | 'error';
  current?: number;
  total?: number;
  message?: string;
}

export function SyncProgress({ status, current = 0, total = 100, message }: SyncProgressProps) {
  const { t } = useTranslation();

  if (status === 'idle') {
    return null;
  }

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'syncing' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">{t('api.syncing')}</span>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">{t('api.syncComplete')}</span>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">{t('api.syncFailed')}</span>
            </>
          )}
        </div>
        {status === 'syncing' && total > 0 && (
          <span className="text-sm text-muted-foreground">
            {current} / {total}
          </span>
        )}
      </div>

      {status === 'syncing' && <Progress value={progress} className="h-2" />}

      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
