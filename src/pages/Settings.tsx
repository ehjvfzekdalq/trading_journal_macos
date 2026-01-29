import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Settings as SettingsType, type ApiCredentialSafe } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Download, Upload, AlertCircle, XCircle, Trash2, Plus } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { ExchangeCard } from '../components/ExchangeCard';
import { ExchangeDialog } from '../components/ExchangeDialog';
import { SyncDialog } from '../components/SyncDialog';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<ApiCredentialSafe[]>([]);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [testingCredentialId, setTestingCredentialId] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncingCredential, setSyncingCredential] = useState<ApiCredentialSafe | null>(null);

  useEffect(() => {
    loadSettings();
    loadCredentials();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
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
      alert('Failed to load credentials: ' + error);
    }
  };

  const handleTestCredentials = async (id: string) => {
    setTestingCredentialId(id);
    try {
      const isValid = await api.testApiCredentials(id);
      if (isValid) {
        alert('Connection successful!');
      } else {
        alert('Connection failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Failed to test credentials:', error);
      alert('Failed to test credentials: ' + error);
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
      alert('Failed to delete credentials: ' + error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.updateApiCredentialsStatus(id, isActive);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to update credentials:', error);
      alert('Failed to update credentials: ' + error);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const updated = await api.updateSettings({
        initial_capital: settings.initial_capital,
        current_r_percent: settings.current_r_percent,
        default_min_rr: settings.default_min_rr,
        default_leverage: settings.default_leverage,
        currency: settings.currency,
      });
      setSettings(updated);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
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
        alert('Data exported successfully!');
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      alert('Failed to export data: ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (!confirm('Import backup? This will add trades from the backup. Existing trades will not be affected.')) {
      return;
    }

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

        alert(`Import complete!\nSettings updated: ${settingsUpdated}\nTrades imported: ${tradesImported}`);

        // Reload settings
        await loadSettings();
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      alert('Failed to import data: ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImported = async () => {
    if (!confirm('Delete ALL BitGet imported trades? This cannot be undone.')) {
      return;
    }

    setSaving(true);
    try {
      const count = await api.deleteBitgetTrades();
      alert(`Deleted ${count} imported trades`);
    } catch (error) {
      console.error('Failed to delete trades:', error);
      alert('Failed to delete trades: ' + error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllTrades = async () => {
    if (!confirm('⚠️ DELETE ALL TRADES?\n\nThis will permanently delete ALL trades from your journal.\n\nThis action CANNOT be undone!\n\nType "DELETE" to confirm.')) {
      return;
    }

    // Additional confirmation
    const confirmation = prompt('Type DELETE (in capitals) to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Deletion cancelled');
      return;
    }

    setSaving(true);
    try {
      const count = await api.deleteAllTrades();
      alert(`Successfully deleted ${count} trade(s)`);
    } catch (error) {
      console.error('Failed to delete all trades:', error);
      alert('Failed to delete trades: ' + error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('settings.title') || 'Settings'}
        </h1>
        <p className="text-muted-foreground">
          Configure your trading preferences
        </p>
      </div>

      {/* Language Preference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Language</CardTitle>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Portfolio Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Row 1 */}
            <div className="space-y-1.5">
              <Label htmlFor="initial_capital" className="text-xs font-medium">
                Initial Capital
              </Label>
              <Input
                id="initial_capital"
                type="number"
                value={settings.initial_capital}
                onChange={(e) => setSettings({ ...settings, initial_capital: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Starting portfolio value</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs font-medium">
                Currency
              </Label>
              <Input
                id="currency"
                type="text"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="h-8 text-sm"
                placeholder="USD"
              />
              <p className="text-[10px] text-muted-foreground">Display currency</p>
            </div>

            {/* Row 2 */}
            <div className="space-y-1.5">
              <Label htmlFor="current_r_percent" className="text-xs font-medium">
                Risk % (R)
              </Label>
              <Input
                id="current_r_percent"
                type="number"
                step="0.1"
                value={settings.current_r_percent}
                onChange={(e) => setSettings({ ...settings, current_r_percent: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Default risk per trade</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="default_min_rr" className="text-xs font-medium">
                Minimum R:R
              </Label>
              <Input
                id="default_min_rr"
                type="number"
                step="0.1"
                value={settings.default_min_rr}
                onChange={(e) => setSettings({ ...settings, default_min_rr: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Min risk:reward ratio</p>
            </div>

            {/* Row 3 */}
            <div className="space-y-1.5">
              <Label htmlFor="default_leverage" className="text-xs font-medium">
                Default Leverage
              </Label>
              <Input
                id="default_leverage"
                type="number"
                value={settings.default_leverage}
                onChange={(e) => setSettings({ ...settings, default_leverage: parseInt(e.target.value) })}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Leverage multiplier (1-125x)</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Exchange Connections</CardTitle>
            <Button onClick={() => setShowExchangeDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Exchange
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No exchanges connected yet.</p>
              <p className="text-sm mt-2">Add an exchange to automatically sync your trades.</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              Export your data as JSON backup. You can restore from backup later or migrate to another device.
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={handleExport} disabled={saving}>
              <Download className="h-4 w-4 mr-2" />
              Export Backup
            </Button>
            <Button variant="outline" onClick={handleImport} disabled={saving}>
              <Upload className="h-4 w-4 mr-2" />
              Import Backup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm text-destructive">
              <strong>Warning:</strong> These actions are irreversible and will permanently delete data from your journal.
            </div>
          </div>

          {/* Delete Imported Trades */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex-1">
              <div className="font-medium">Delete All Imported Trades</div>
              <div className="text-sm text-muted-foreground">
                Remove all BitGet imported trades from your journal
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteImported}
              disabled={saving}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Delete Imported
            </Button>
          </div>

          {/* Delete All Trades */}
          <div className="flex items-center justify-between p-4 border border-destructive rounded-lg bg-destructive/5">
            <div className="flex-1">
              <div className="font-medium text-destructive">Delete All Trades</div>
              <div className="text-sm text-muted-foreground">
                Permanently delete ALL trades from your journal. This cannot be undone!
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAllTrades}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
