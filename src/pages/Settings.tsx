import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, type Settings as SettingsType, type ApiCredentialSafe } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Download, Upload, AlertCircle, XCircle, Trash2, Plus } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { ExchangeCard } from '../components/ExchangeCard';
import { ExchangeDialog } from '../components/ExchangeDialog';
import { SyncDialog } from '../components/SyncDialog';
import { DeleteConfirmDialog } from '../components/DeleteConfirmDialog';
import { Switch } from '../components/ui/switch';
import { useAnonymousMode } from '../contexts/AnonymousModeContext';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { isAnonymous, toggleAnonymous } = useAnonymousMode();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<ApiCredentialSafe[]>([]);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [testingCredentialId, setTestingCredentialId] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncingCredential, setSyncingCredential] = useState<ApiCredentialSafe | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [totalTrades, setTotalTrades] = useState(0);
  const [importedTrades, setImportedTrades] = useState(0);

  useEffect(() => {
    loadSettings();
    loadCredentials();
    loadTradeCounts();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      // Convert r_percent from decimal to percentage for display
      setSettings({
        ...data,
        current_r_percent: data.current_r_percent * 100
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async () => {
    try {
      console.log('Loading API credentials...');
      const data = await api.listApiCredentials();
      console.log('API credentials loaded:', data);
      setCredentials(data);
    } catch (error) {
      console.error('Failed to load API credentials:', error);
      toast.error(t('settings.failedToLoadCredentials') + ': ' + error);
    }
  };

  const loadTradeCounts = async () => {
    try {
      const allTrades = await api.getTrades();
      setTotalTrades(allTrades.length);

      const imported = allTrades.filter(t => t.import_fingerprint !== null && t.import_fingerprint !== undefined);
      setImportedTrades(imported.length);
    } catch (error) {
      console.error('Failed to load trade counts:', error);
    }
  };

  const handleTestCredentials = async (id: string) => {
    setTestingCredentialId(id);
    try {
      const isValid = await api.testApiCredentials(id);
      if (isValid) {
        toast.success(t('settings.connectionSuccessful'));
      } else {
        toast.error(t('settings.connectionFailed'));
      }
    } catch (error) {
      console.error('Failed to test credentials:', error);
      toast.error(t('settings.failedToTestCredentials') + ': ' + error);
    } finally {
      setTestingCredentialId(null);
    }
  };

  const handleSync = (id: string) => {
    const credential = credentials.find(c => c.id === id);
    if (credential) {
      setSyncingCredential(credential);
      setSyncDialogOpen(true);
    }
  };

  const handleSyncComplete = async () => {
    await loadCredentials(); // Refresh to show updated last_sync_timestamp
  };

  const handleDeleteCredentials = async (id: string) => {
    try {
      await api.deleteApiCredentials(id);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to delete credentials:', error);
      toast.error(t('settings.failedToDeleteCredentials') + ': ' + error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.updateApiCredentialsStatus(id, isActive);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to update credentials:', error);
      toast.error(t('settings.failedToUpdateCredentials') + ': ' + error);
    }
  };

  const handleAutoSyncChange = async (id: string, enabled: boolean, interval: number) => {
    try {
      await api.updateAutoSyncSettings(id, enabled, interval);
      // Reload the sync scheduler to pick up changes
      await api.reloadSyncScheduler();
      await loadCredentials();
      toast.success(t('settings.autoSyncUpdated') || 'Auto-sync settings updated');
    } catch (error) {
      console.error('Failed to update auto-sync settings:', error);
      toast.error(t('settings.failedToUpdateAutoSync') + ': ' + error);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const updated = await api.updateSettings({
        initial_capital: settings.initial_capital,
        current_r_percent: settings.current_r_percent / 100, // Convert from percentage to decimal
        default_min_rr: settings.default_min_rr,
        default_leverage: settings.default_leverage,
        currency: settings.currency,
      });
      // Convert back to percentage for display
      setSettings({
        ...updated,
        current_r_percent: updated.current_r_percent * 100
      });
      toast.success(t('settings.settingsSaved'));
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setSaving(true);
    try {
      const jsonData = await api.exportAllData();

      const filePath = await save({
        defaultPath: `trading-journal-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (filePath) {
        await writeTextFile(filePath, jsonData);
        toast.success(t('settings.exportSuccess'));
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      toast.error(t('settings.exportFailed') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    setSaving(true);
    try {
      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (filePath && typeof filePath === 'string') {
        const jsonData = await readTextFile(filePath);
        const [settingsUpdated, tradesImported] = await api.importAllData(jsonData);

        toast.success(t('settings.importedDetails', { settings: settingsUpdated, trades: tradesImported }));

        // Reload settings and trade counts
        await loadSettings();
        await loadTradeCounts();
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      toast.error(t('settings.importFailed') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImported = async () => {
    try {
      const count = await toast.promise(
        api.deleteBitgetTrades(),
        {
          loading: t('settings.deletingImported') || 'Deleting imported trades...',
          success: (count) => t('settings.deletedImported', { count }),
          error: (error) => t('settings.deleteFailed') + ': ' + error,
        }
      ) as number;
      // Reload data after successful deletion
      if (count > 0) {
        loadSettings();
        loadTradeCounts();
      }
    } catch (error) {
      // Error already shown by toast.promise
      console.error('Delete imported trades failed:', error);
    }
  };

  const handleDeleteAllTrades = async () => {
    try {
      const count = await toast.promise(
        api.deleteAllTrades(),
        {
          loading: t('settings.deletingAllTrades') || 'Deleting all trades...',
          success: (count) => t('settings.deleteSuccess', { count }),
          error: (error) => t('settings.deleteFailed') + ': ' + error,
        }
      ) as number;
      // Reload data after successful deletion
      if (count > 0) {
        loadSettings();
        loadTradeCounts();
      }
    } catch (error) {
      // Error already shown by toast.promise
      console.error('Delete all trades failed:', error);
    }
  };

  if (loading || !settings) {
    return <div className="text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          {t('settings.title')}
          <HelpBadge section="settings" />
        </h1>
        <p className="text-muted-foreground">
          {t('settings.configureTradingPreferences')}
        </p>
      </div>

      {/* Language Preference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.language')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={i18n.language === 'en' ? 'default' : 'outline'}
              onClick={() => {
                i18n.changeLanguage('en');
                localStorage.setItem('language', 'en');
              }}
              className="flex-1"
            >
              English
            </Button>
            <Button
              variant={i18n.language === 'fr' ? 'default' : 'outline'}
              onClick={() => {
                i18n.changeLanguage('fr');
                localStorage.setItem('language', 'fr');
              }}
              className="flex-1"
            >
              Français
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.privacySettings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('settings.anonymousMode')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.anonymousModeDescription')}
              </p>
            </div>
            <Switch
              checked={isAnonymous}
              onCheckedChange={toggleAnonymous}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('settings.portfolioSettings')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {/* Row 1 */}
            <div className="space-y-1.5">
              <Label htmlFor="initial_capital" className="text-xs font-medium">
                {t('settings.initialCapital')}
              </Label>
              <Input
                id="initial_capital"
                type="number"
                value={settings.initial_capital}
                onChange={(e) => setSettings({ ...settings, initial_capital: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{t('settings.startingPortfolioValue')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs font-medium">
                {t('settings.currency')}
              </Label>
              <Input
                id="currency"
                type="text"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="h-8 text-sm"
                placeholder="USD"
              />
              <p className="text-[10px] text-muted-foreground">{t('settings.displayCurrency')}</p>
            </div>

            {/* Row 2 */}
            <div className="space-y-1.5">
              <Label htmlFor="current_r_percent" className="text-xs font-medium">
                {t('settings.riskPercent')}
              </Label>
              <Input
                id="current_r_percent"
                type="number"
                step="0.1"
                value={settings.current_r_percent}
                onChange={(e) => setSettings({ ...settings, current_r_percent: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{t('settings.defaultRiskPerTrade')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="default_min_rr" className="text-xs font-medium">
                {t('settings.minimumRR')}
              </Label>
              <Input
                id="default_min_rr"
                type="number"
                step="0.1"
                value={settings.default_min_rr}
                onChange={(e) => setSettings({ ...settings, default_min_rr: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{t('settings.minRiskRewardRatio')}</p>
            </div>

            {/* Row 3 */}
            <div className="space-y-1.5">
              <Label htmlFor="default_leverage" className="text-xs font-medium">
                {t('settings.defaultLeverage')}
              </Label>
              <Input
                id="default_leverage"
                type="number"
                value={settings.default_leverage}
                onChange={(e) => setSettings({ ...settings, default_leverage: parseInt(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{t('settings.leverageMultiplier')}</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8">
              {saving ? t('settings.saving') : t('settings.saveSettings')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('settings.exchangeConnections')}</CardTitle>
            <Button onClick={() => setShowExchangeDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.addExchange')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('api.noSyncHistory')}</p>
              <p className="text-sm mt-2">{t('api.addExchangeDescription')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((cred) => (
                <ExchangeCard
                  key={cred.id}
                  credential={cred}
                  onTest={handleTestCredentials}
                  onSync={handleSync}
                  onDelete={handleDeleteCredentials}
                  onToggleActive={handleToggleActive}
                  onAutoSyncChange={handleAutoSyncChange}
                  isTesting={testingCredentialId === cred.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ExchangeDialog
        open={showExchangeDialog}
        onOpenChange={setShowExchangeDialog}
        onSaved={loadCredentials}
      />

      {syncingCredential && (
        <SyncDialog
          open={syncDialogOpen}
          onOpenChange={setSyncDialogOpen}
          credentialId={syncingCredential.id}
          exchangeName={syncingCredential.exchange}
          historyLimit={syncingCredential.exchange === 'bitget' ? '90 days' : '180 days'}
          onComplete={handleSyncComplete}
        />
      )}

      <DeleteConfirmDialog
        open={deleteAllDialogOpen}
        onOpenChange={setDeleteAllDialogOpen}
        onConfirm={handleDeleteAllTrades}
        title={t('settings.deleteAllTrades')}
        description={t('settings.deleteAllTradesDescription')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.backupRestore')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              {t('settings.backupDescription')}
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={handleExport} disabled={saving}>
              <Download className="h-4 w-4 mr-2" />
              {t('settings.exportBackup')}
            </Button>
            <Button variant="outline" onClick={handleImport} disabled={saving}>
              <Upload className="h-4 w-4 mr-2" />
              {t('settings.importBackup')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t('settings.dangerZone')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm text-destructive">
              {t('settings.dangerZoneWarning')}
            </div>
          </div>

          {/* Delete Imported Trades */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex-1">
              <div className="font-medium">{t('settings.deleteImportedTrades')}</div>
              <div className="text-sm text-muted-foreground">
                {t('settings.deleteImportedTradesDesc')}
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteImported}
              disabled={saving || importedTrades === 0}
            >
              <XCircle className="h-4 w-4 mr-2" />
              {t('settings.deleteImported')}
            </Button>
          </div>

          {/* Delete All Trades */}
          <div className="flex items-center justify-between p-4 border border-destructive rounded-lg bg-destructive/5">
            <div className="flex-1">
              <div className="font-medium text-destructive">{t('settings.deleteAllTrades')}</div>
              <div className="text-sm text-muted-foreground">
                {t('settings.deleteAllTradesDescription')}
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteAllDialogOpen(true)}
              disabled={saving || totalTrades === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('settings.deleteAll')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
