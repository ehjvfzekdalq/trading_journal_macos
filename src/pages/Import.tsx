import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { api, type ImportPreview, type ImportResult } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { ArrowLeft, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { HelpBadge } from '../components/HelpBadge';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorDialog } from '../components/ErrorDialog';
import { ImportResultDialog } from '../components/ImportResultDialog';

type Exchange = 'BitGet' | 'BloFin';

// Tauri v2 drag-drop event types
type DragDropEventType = 'enter' | 'over' | 'drop' | 'leave';

interface DragDropPayload {
  type: DragDropEventType;
  paths?: string[];
}

interface DragDropEvent {
  payload: DragDropPayload;
}

type UnlistenFn = () => void;

export default function Import() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<Exchange>('BitGet');
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

  // Keep a ref so the drop handler always calls the current processFile
  // (avoids stale closure since the useEffect runs only once)
  const processFileRef = useRef<(content: string) => Promise<void>>(async () => {});

  // Set up Tauri v2 drag-drop listener (onDragDropEvent on WebviewWindow)
  useEffect(() => {
    const webviewWindow = getCurrentWebviewWindow();
    let unlistenFn: UnlistenFn | undefined;
    let isMounted = true;

    const setupFileDrop = async () => {
      try {
        const unlisten = await (webviewWindow as typeof webviewWindow & {
          onDragDropEvent: (handler: (event: DragDropEvent) => void | Promise<void>) => Promise<UnlistenFn>
        }).onDragDropEvent(async (event: DragDropEvent) => {
          const { type, paths } = event.payload;
          if (type === 'enter' || type === 'over') {
            setIsDragging(true);
          } else if (type === 'drop') {
            setIsDragging(false);
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              if (filePath.endsWith('.csv')) {
                try {
                  const { readTextFile } = await import('@tauri-apps/plugin-fs');
                  const content = await readTextFile(filePath);
                  await processFileRef.current(content);
                } catch (error) {
                  setErrorDialog({ open: true, message: 'Failed to read file: ' + error });
                }
              } else {
                setErrorDialog({ open: true, message: 'Please drop a CSV file' });
              }
            }
          } else if (type === 'leave') {
            setIsDragging(false);
          }
        });

        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      } catch (error) {
        console.error('Failed to set up drag-drop listener:', error);
      }
    };

    setupFileDrop();

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleExchangeChange = (exchange: Exchange) => {
    setSelectedExchange(exchange);
    // Clear any loaded preview when switching exchange
    setCsvContent('');
    setPreviews([]);
    setImportResult(null);
  };

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (selected && typeof selected === 'string') {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(selected);
        await processFile(content);
      }
    } catch (error) {
      setErrorDialog({ open: true, message: 'Failed to open file: ' + error });
    }
  };

  const processFile = async (content: string) => {
    setCsvContent(content);

    try {
      const settings = await api.getSettings();
      setPortfolio(settings.initial_capital);
      setRPercent(settings.current_r_percent * 100);
      await previewImport(content, settings.initial_capital, settings.current_r_percent);
    } catch (error) {
      console.error('Failed to load settings:', error);
      await previewImport(content, portfolio, rPercent / 100);
    }
  };

  // Keep the ref pointing to the latest processFile after every render
  // so the drag-drop handler (set up once) never has a stale closure
  processFileRef.current = processFile;

  // Ref for the preview section — used to auto-scroll when trades are detected
  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to preview as soon as trades/positions are detected
  useEffect(() => {
    if (previews.length > 0) {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [previews.length]);

  const previewImport = async (content: string, port: number, rPct: number) => {
    setLoading(true);
    setImportResult(null);
    try {
      const preview = selectedExchange === 'BloFin'
        ? await api.previewBlofinImport(content, port, rPct)
        : await api.previewBitgetImport(content, port, rPct);
      setPreviews(preview);
    } catch (error) {
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
      const result = selectedExchange === 'BloFin'
        ? await api.importBlofinCsv(csvContent, portfolio, rPercent / 100)
        : await api.importBitgetCsv(csvContent, portfolio, rPercent / 100);
      setImportResult(result);
      setCsvContent('');
      setPreviews([]);
    } catch (error) {
      setErrorDialog({ open: true, message: 'Failed to import trades: ' + error });
    } finally {
      setLoading(false);
    }
  };

  const instructions = selectedExchange === 'BloFin'
    ? {
        title: t('import.blofinHowToImport'),
        steps: [
          t('import.blofinStep1'),
          t('import.blofinStep2'),
          t('import.blofinStep3'),
          t('import.blofinStep4'),
        ],
        note: t('import.blofinNote'),
      }
    : {
        title: t('import.howToImport'),
        steps: [
          t('import.instructionStep1'),
          t('import.instructionStep2'),
          t('import.instructionStep3'),
          t('import.instructionStep4'),
        ],
        note: t('import.noteShort'),
      };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/journal')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('import.title')}
            <HelpBadge section="import" />
          </h1>
          <p className="text-muted-foreground">{t('import.description')}</p>
        </div>
      </div>

      {/* Exchange Selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t('import.selectExchange')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(['BitGet', 'BloFin'] as Exchange[]).map((exchange) => (
              <button
                key={exchange}
                onClick={() => handleExchangeChange(exchange)}
                className={`px-5 py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${
                  selectedExchange === exchange
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50 text-foreground'
                }`}
              >
                {exchange}
              </button>
            ))}
          </div>
          {selectedExchange === 'BloFin' && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('import.blofinExchangeNote')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>{instructions.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            {instructions.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 mt-4">
            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="text-sm text-warning-foreground">
              {instructions.note}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload with Drag & Drop */}
      <Card>
        <CardHeader>
          <CardTitle>{t('import.selectFileButton')}</CardTitle>
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
              <div className={`rounded-full p-4 ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                <Upload className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>

              <div className="space-y-2">
                <p className={`text-lg font-medium ${isDragging ? 'text-primary' : ''}`}>
                  {isDragging ? t('import.dragDropActive') : t('import.dragDropMessage')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('import.browseMessage')}
                </p>
              </div>

              <Button
                onClick={handleFileSelect}
                disabled={loading}
                variant={isDragging ? 'default' : 'outline'}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('import.selectFile')}
              </Button>
            </div>
          </div>

          {previews.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div className="text-sm font-medium text-success">
                {selectedExchange === 'BloFin'
                  ? t('import.blofinFoundPositions', { count: previews.length })
                  : `Found ${previews.length} trades in file`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {previews.length > 0 && !importResult && (
        <Card ref={previewRef}>
          <CardHeader>
            <CardTitle>Preview ({previews.length} {selectedExchange === 'BloFin' ? 'positions' : 'trades'})</CardTitle>
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
                        preview.position_type === 'LONG'
                          ? 'bg-success/20 text-success'
                          : 'bg-destructive/20 text-destructive'
                      }`}>
                        {preview.position_type}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('import.entry')}: ${preview.entry_price.toFixed(4)} → {t('import.exit')}: ${preview.exit_price.toFixed(4)} | {t('import.qty')}: {preview.quantity.toFixed(4)}
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
                      {t('import.fees')}: {formatCurrency(preview.total_fees)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button variant="outline" onClick={() => { setCsvContent(''); setPreviews([]); }}>
                {t('import.cancel')}
              </Button>
              <Button onClick={handleImportClick} disabled={loading}>
                {loading ? t('import.importing') : t('import.importButton', { count: previews.length })}
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
              {t('import.importComplete')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">{t('import.importedCount')}</div>
                <div className="text-2xl font-bold text-success">{importResult.imported}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('import.duplicatesCount')}</div>
                <div className="text-2xl font-bold text-warning">{importResult.duplicates}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('import.errorsCount')}</div>
                <div className="text-2xl font-bold text-destructive">{importResult.errors.length}</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-destructive">{t('import.errorsList')}</div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-destructive">{error}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t">
              <Button onClick={() => navigate('/journal')}>
                {t('import.viewJournal')}
              </Button>
              <Button variant="outline" onClick={() => setImportResult(null)}>
                {t('import.importMore')}
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
        description={`Import ${previews.length} ${selectedExchange === 'BloFin' ? 'positions' : 'trades'}? This will add them to your journal.`}
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
