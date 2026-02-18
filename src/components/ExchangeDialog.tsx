'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiCredentialInput, api } from '@/lib/api';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExchangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ExchangeDialog({ open, onOpenChange, onSaved }: ExchangeDialogProps) {
  const { t } = useTranslation();
  const [exchange, setExchange] = useState<string>('bitget');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setExchange('bitget');
    setLabel('');
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    setTestResult(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleTestAndSave = async () => {
    setError(null);
    setIsTesting(true);

    try {
      // First, save the credentials
      const input: ApiCredentialInput = {
        exchange,
        label: label || `${exchange.toUpperCase()} Account`,
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: passphrase || undefined,
        is_active: true,
      };

      const savedCred = await api.saveApiCredentials(input);

      // Then test them
      const isValid = await api.testApiCredentials(savedCred.id);

      if (isValid) {
        setTestResult('success');
        setTimeout(() => {
          onSaved();
          handleClose();
        }, 1000);
      } else {
        setTestResult('error');
        setError(t('api.invalidCredentials'));
        // Delete the credential since it failed
        await api.deleteApiCredentials(savedCred.id);
      }
    } catch (err) {
      setTestResult('error');
      setError(err instanceof Error ? err.message : t('api.unknownError'));
    } finally {
      setIsTesting(false);
    }
  };

  const isFormValid = apiKey && apiSecret && (exchange !== 'bitget' || passphrase);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('api.addExchange')}</DialogTitle>
          <DialogDescription>{t('api.addExchangeDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('api.readOnlyWarning')}</AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="exchange">{t('api.exchange')}</Label>
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger id="exchange">
                <SelectValue placeholder={t('api.selectExchange')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bitget">BitGet</SelectItem>
                <SelectItem value="blofin">BloFin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">{t('api.label')}</Label>
            <Input
              id="label"
              placeholder={`${exchange.toUpperCase()} Account`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">{t('api.apiKey')}</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={t('api.enterApiKey')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">{t('api.apiSecret')}</Label>
            <Input
              id="apiSecret"
              type="password"
              placeholder={t('api.enterApiSecret')}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
            />
          </div>

          {exchange === 'bitget' && (
            <div className="space-y-2">
              <Label htmlFor="passphrase">{t('api.passphrase')}</Label>
              <Input
                id="passphrase"
                type="password"
                placeholder={t('api.enterPassphrase')}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {testResult === 'success' && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                {t('api.credentialsValid')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isTesting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleTestAndSave} disabled={!isFormValid || isTesting}>
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('api.testing')}
              </>
            ) : (
              t('api.testAndSave')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
