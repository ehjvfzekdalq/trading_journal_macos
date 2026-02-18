'use client';

import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: {
    imported: number;
    duplicates: number;
    errors: string[];
  } | null;
}

export function ImportResultDialog({
  open,
  onOpenChange,
  result,
}: ImportResultDialogProps) {
  const { t } = useTranslation();

  if (!result) return null;

  const hasErrors = result.errors.length > 0;
  const isSuccess = result.errors.length === 0 && result.imported > 0;
  const isDelete = result.imported === 0 && result.duplicates > 0;
  const hasNoChanges = result.imported === 0 && result.duplicates === 0;

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" />
                {t('importResult.successTitle')}
              </>
            ) : isDelete ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" />
                {t('importResult.deletedTitle')}
              </>
            ) : hasNoChanges ? (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                {t('importResult.noNewTradesTitle')}
              </>
            ) : hasErrors ? (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                {t('importResult.warningTitle')}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" />
                {t('importResult.completedTitle')}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? t('importResult.deletedDescription', { count: result.duplicates })
              : hasNoChanges
              ? t('importResult.allExistDescription')
              : t('importResult.processedDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {isDelete ? (
            <div className="text-center">
              <p className="text-muted-foreground">{t('importResult.deleted')}</p>
              <p className="text-3xl font-bold text-success">{result.duplicates}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('importResult.imported')}</p>
                <p className="text-2xl font-bold text-success">{result.imported}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('importResult.duplicatesSkipped')}</p>
                <p className="text-2xl font-bold text-yellow-600">{result.duplicates}</p>
              </div>
            </div>
          )}

          {hasErrors && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <p className="font-medium text-sm mb-2">{t('importResult.errors')}</p>
              <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {result.errors.slice(0, 10).map((error, i) => (
                  <li key={i} className="text-muted-foreground">
                    • {error}
                  </li>
                ))}
                {result.errors.length > 10 && (
                  <li className="text-muted-foreground italic">
                    {t('importResult.andMore', { count: result.errors.length - 10 })}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>{t('importResult.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
