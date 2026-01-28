'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FolderOpen, ShieldCheck, X } from 'lucide-react';
import { importAllData, readFileAsText } from '@/lib/data-export';

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
  locale: string;
}

export function OnboardingDialog({ open, onClose, locale }: OnboardingDialogProps) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImportBackup = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const jsonString = await readFileAsText(file);
      const result = await importAllData(jsonString);

      if (result.success) {
        // Close dialog and reload page to show new data
        onClose();
        window.location.reload();
      } else {
        alert(t('importFailed'));
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert(t('importFailed'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadCSV = () => {
    onClose();
    router.push(`/${locale}/journal/import`);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl mb-2">{t('title')}</DialogTitle>
                <DialogDescription className="text-base">
                  {t('subtitle')}
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Privacy Notice */}
            <div className="flex items-start gap-3 rounded-lg border border-green-500/50 bg-green-500/10 p-4">
              <ShieldCheck className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-green-500">{t('privacyTitle')}</p>
                <p className="text-sm text-green-500/90">
                  {t('privacyMessage')}
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{t('getStarted')}</p>

              <div className="space-y-2">
                {/* Step 1: Upload CSV */}
                <div className="group rounded-lg border border-border hover:border-primary transition-colors cursor-pointer p-4"
                     onClick={handleUploadCSV}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">{t('step1Title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('step1Description')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 2: Load Backup */}
                <div className="group rounded-lg border border-border hover:border-primary transition-colors cursor-pointer p-4"
                     onClick={handleImportBackup}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">{t('step2Title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('step2Description')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleUploadCSV}
                className="flex-1 gap-2"
                size="lg"
              >
                <Upload className="h-4 w-4" />
                {t('uploadCSV')}
              </Button>
              <Button
                onClick={handleImportBackup}
                variant="outline"
                className="flex-1 gap-2"
                size="lg"
                disabled={importing}
              >
                <FolderOpen className="h-4 w-4" />
                {importing ? t('importing') : t('loadBackup')}
              </Button>
            </div>

            <div className="text-center">
              <Button
                variant="ghost"
                onClick={onClose}
                className="text-sm text-muted-foreground"
              >
                {t('dismiss')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
