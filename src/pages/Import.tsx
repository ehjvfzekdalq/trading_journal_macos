import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { api, type ImportPreview, type ImportResult } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorDialog } from '../components/ErrorDialog';
import { ImportResultDialog } from '../components/ImportResultDialog';

export default function Import() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<ImportPreview[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [portfolio, setPortfolio] = useState(10000);
  const [rPercent, setRPercent] = useState(2);
  const [isDragging, setIsDragging] = useState(false);

  // Dialog states
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; message: string | null }>({ open: false, message: null });
  const [confirmImportDialog, setConfirmImportDialog] = useState(false);
  const [importResultDialog, setImportResultDialog] = useState<{ open: boolean; result: { imported: number; duplicates: number; errors: string[] } | null }>({ open: false, result: null });

  // Set up Tauri file drop listener
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;

    const setupFileDrop = async () => {
      try {
        const unlisten = await (appWindow as any).onFileDropEvent(async (event: any) => {
          if (event.payload.type === 'hover') {
            setIsDragging(true);
          } else if (event.payload.type === 'drop') {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              if (filePath.endsWith('.csv')) {
                try {
                  const { readTextFile } = await import('@tauri-apps/plugin-fs');
                  const content = await readTextFile(filePath);
                  await processFile(content);
                } catch (error) {
                  console.error('Failed to read dropped file:', error);
                  setErrorDialog({ open: true, message: 'Failed to read file: ' + error });
                }
              } else {
                setErrorDialog({ open: true, message: 'Please drop a CSV file' });
              }
            }
          } else if (event.payload.type === 'cancel') {
            setIsDragging(false);
          }
        });

        // Only store the unlisten function if component is still mounted
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          // Component already unmounted, clean up immediately
          unlisten();
        }
      } catch (error) {
        console.error('Failed to set up file drop listener:', error);
      }
    };

    setupFileDrop();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'CSV',
          extensions: ['csv']
        }]
      });

      if (selected && typeof selected === 'string') {
        // Read file using Tauri
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(selected);
        await processFile(content);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
      setErrorDialog({ open: true, message: 'Failed to open file: ' + error });
    }
  };

  const processFile = async (content: string) => {
    setCsvContent(content);

    // Load settings for portfolio values
    try {
      const settings = await api.getSettings();
      setPortfolio(settings.initial_capital);
      setRPercent(settings.current_r_percent);

      // Preview trades with loaded settings
      await previewImport(content, settings.initial_capital, settings.current_r_percent / 100);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use default values if settings fail to load
      await previewImport(content, portfolio, rPercent / 100);
    }
  };


  const previewImport = async (content: string, port: number, rPct: number) => {
    setLoading(true);
    setImportResult(null);
    try {
      const preview = await api.previewBitgetImport(content, port, rPct);
      setPreviews(preview);
    } catch (error) {
      console.error('Failed to preview import:', error);
      setErrorDialog({ open: true, message: 'Failed to preview import: ' + error });
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    if (!csvContent) return;
    setConfirmImportDialog(true);
  };

  const handleImportConfirm = async () => {
    setConfirmImportDialog(false);
    setLoading(true);
    try {
      const result = await api.importBitgetCsv(csvContent, portfolio, rPercent / 100);
      setImportResult(result);
      setCsvContent('');
      setPreviews([]);
    } catch (error) {
      console.error('Failed to import trades:', error);
      setErrorDialog({ open: true, message: 'Failed to import trades: ' + error });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            Import Trades
            <HelpBadge section="import" />
          </h1>
          <p className="text-muted-foreground">Import trades from BitGet CSV export</p>
        </div>
      </div>

      {/* Import Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Import from BitGet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Go to BitGet → Futures → Orders → History</li>
            <li>Export your closed positions to CSV</li>
            <li>Click "Select CSV File" below to upload</li>
            <li>Review the preview and click "Import Trades"</li>
          </ol>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 mt-4">
            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="text-sm text-warning-foreground">
              <strong>Note:</strong> BitGet CSV doesn't include stop loss data. RR metrics will be unavailable for imported trades.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload with Drag & Drop */}
      <Card>
        <CardHeader>
          <CardTitle>Select File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 transition-all ${
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50'
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className={`rounded-full p-4 ${
                isDragging ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Upload className={`h-8 w-8 ${
                  isDragging ? 'text-primary' : 'text-muted-foreground'
                }`} />
              </div>

              <div className="space-y-2">
                <p className={`text-lg font-medium ${
                  isDragging ? 'text-primary' : ''
                }`}>
                  {isDragging ? 'Drop CSV file here' : 'Drag & drop CSV file here'}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click the button below to browse
                </p>
              </div>

              <Button
                onClick={handleFileSelect}
                disabled={loading}
                variant={isDragging ? 'default' : 'outline'}
              >
                <Upload className="h-4 w-4 mr-2" />
                Select CSV File
              </Button>
            </div>
          </div>

          {previews.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div className="text-sm font-medium text-success">
                Found {previews.length} trades in file
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {previews.length > 0 && !importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({previews.length} trades)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-96 overflow-y-auto space-y-2">
              {previews.map((preview, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{preview.pair}</div>
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        preview.position_type === 'LONG' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                      }`}>
                        {preview.position_type}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Entry: ${preview.entry_price.toFixed(4)} → Exit: ${preview.exit_price.toFixed(4)} | Qty: {preview.quantity.toFixed(4)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(preview.opening_time).toLocaleDateString()} - {new Date(preview.closing_time).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      preview.realized_pnl >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(preview.realized_pnl)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Fees: {formatCurrency(preview.total_fees)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                setCsvContent('');
                setPreviews([]);
              }}>
                Cancel
              </Button>
              <Button onClick={handleImportClick} disabled={loading}>
                {loading ? 'Importing...' : `Import ${previews.length} Trades`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Result */}
      {importResult && (
        <Card className="border-2 border-success/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Imported</div>
                <div className="text-2xl font-bold text-success">{importResult.imported}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Duplicates Skipped</div>
                <div className="text-2xl font-bold text-warning">{importResult.duplicates}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Errors</div>
                <div className="text-2xl font-bold text-destructive">{importResult.errors.length}</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-destructive">Errors:</div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-destructive">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t">
              <Button onClick={() => navigate('/journal')}>
                View Journal
              </Button>
              <Button variant="outline" onClick={() => setImportResult(null)}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ErrorDialog
        open={errorDialog.open}
        onOpenChange={(open) => setErrorDialog({ open, message: null })}
        error={errorDialog.message}
      />

      <ConfirmDialog
        open={confirmImportDialog}
        onOpenChange={setConfirmImportDialog}
        title="Import Trades?"
        description={`Import ${previews.length} trades? This will add them to your journal.`}
        confirmLabel="Import"
        onConfirm={handleImportConfirm}
        loading={loading}
      />

      <ImportResultDialog
        open={importResultDialog.open}
        onOpenChange={(open) => setImportResultDialog({ open, result: null })}
        result={importResultDialog.result}
      />
    </div>
  );
}
