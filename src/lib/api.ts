import { invoke } from '@tauri-apps/api/core';

export interface Settings {
  id: number;
  initial_capital: number;
  current_r_percent: number;
  default_min_rr: number;
  default_leverage: number;
  currency: string;
  created_at: number;
  updated_at: number;
}

export interface Trade {
  id: string;
  pair: string;
  exchange: string;
  analysis_date: number;
  trade_date: number;
  status: string;
  portfolio_value: number;
  r_percent: number;
  min_rr: number;
  planned_pe: number;
  planned_sl: number;
  leverage: number;
  planned_tps: string;
  planned_entries?: string;  // JSON array of {price, percent}
  position_type: string;
  one_r: number;
  margin: number;
  position_size: number;
  quantity: number;
  planned_weighted_rr: number;
  effective_pe?: number;
  effective_entries?: string;  // JSON array of {price, percent}
  close_date?: number;
  exits?: string;
  effective_weighted_rr?: number;
  total_pnl?: number;
  pnl_in_r?: number;
  notes: string;
  execution_portfolio?: number;
  execution_r_percent?: number;
  execution_margin?: number;
  execution_position_size?: number;
  execution_quantity?: number;
  execution_one_r?: number;
  execution_potential_profit?: number;
  import_fingerprint?: string;
  import_source: string; // USER_CREATED | API_IMPORT | CSV_IMPORT | LIVE_MIRROR
  created_at: number;
  updated_at: number;
}

export interface TradeFilters {
  status?: string;
  pair?: string;
  start_date?: number;
  end_date?: number;
  page?: number;
  limit?: number;
}

export interface CreateTradeInput {
  pair: string;
  exchange: string;
  analysis_date: number;
  trade_date: number;
  status: string;
  portfolio_value: number;
  r_percent: number;
  min_rr: number;
  planned_pe: number;
  planned_sl: number;
  leverage: number;
  planned_tps: string;
  planned_entries?: string;  // JSON array of {price, percent}
  position_type: string;
  one_r: number;
  margin: number;
  position_size: number;
  quantity: number;
  planned_weighted_rr: number;
  notes: string;
  execution_portfolio?: number;
  execution_r_percent?: number;
  execution_margin?: number;
  execution_position_size?: number;
  execution_quantity?: number;
  execution_one_r?: number;
  execution_potential_profit?: number;
}

export interface DashboardStats {
  total_trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  open_trades: number;
  win_rate: number;
  total_pnl: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  avg_effective_rr: number;
  best_trade: number;
  worst_trade: number;
}

export interface EquityCurvePoint {
  date: string;
  cumulative_pnl: number;
  daily_pnl: number;
  trade_count: number;
}

export interface ImportPreview {
  pair: string;
  position_type: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  realized_pnl: number;
  opening_time: string;
  closing_time: string;
  total_fees: number;
  fingerprint: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

export interface ApiCredentialSafe {
  id: string;
  exchange: string;
  label: string;
  api_key_preview: string;
  is_active: boolean;
  last_sync_timestamp?: number;
  auto_sync_enabled: boolean;
  auto_sync_interval: number; // Interval in seconds
  live_mirror_enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface ApiCredentialInput {
  id?: string;
  exchange: string;
  label: string;
  api_key: string;
  api_secret: string;
  passphrase?: string;
  is_active?: boolean;
  auto_sync_enabled?: boolean;
  auto_sync_interval?: number;
  live_mirror_enabled?: boolean;
}

export interface ApiSyncHistory {
  id: string;
  credential_id: string;
  exchange: string;
  sync_type: string;
  last_sync_timestamp: number;
  trades_imported: number;
  trades_duplicated: number;
  last_trade_id?: string;
  status: string;
  error_message?: string;
  created_at: number;
}

export interface SyncConfig {
  credential_id: string;
  start_date?: number;
  end_date?: number;
  skip_duplicates: boolean;
  is_auto_sync?: boolean;
}

export interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
  total_pnl?: number;
}

export interface Position {
  position_id: string;
  symbol: string;
  exchange: string;
  position_side: string;
  entry_price: number;
  current_price: number;
  quantity: number;
  leverage: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  liquidation_price: number;
  margin: number;
  margin_mode: string;
  price_distance_to_liquidation_percent: number;
  created_at: number;
  updated_at: number;
}

export interface OpenOrder {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  price: string;
  size: string;
  filled_size: string;
  status: string;
  pos_side?: string;
  trade_side?: string;
  leverage?: string;
  created_at: number;
  updated_at?: number;
}

export interface FetchOpenOrdersRequest {
  credential_id: string;
  symbol?: string;
}

export interface LiveMirrorStatus {
  credential_id: string;
  exchange: string;
  label: string;
  enabled: boolean;
}

// API functions
export const api = {
  // Settings
  getSettings: () => invoke<Settings>('get_settings'),
  updateSettings: (settings: Partial<Settings>) => invoke<Settings>('update_settings', { settings }),

  // Trades
  getTrades: (filters?: TradeFilters) => invoke<Trade[]>('get_trades', { filters }),
  getTrade: (id: string) => invoke<Trade>('get_trade', { id }),
  createTrade: (trade: CreateTradeInput) => invoke<Trade>('create_trade', { trade }),
  updateTrade: (id: string, tradeUpdate: Partial<Trade>) => invoke<Trade>('update_trade', { id, tradeUpdate }),
  deleteTrade: (id: string) => invoke<void>('delete_trade', { id }),
  getDeletedTrades: () => invoke<Trade[]>('get_deleted_trades'),
  restoreTrade: (id: string) => invoke<void>('restore_trade', { id }),
  duplicateTrade: (id: string) => invoke<Trade>('duplicate_trade', { id }),

  // Debug commands
  getAllTradesIncludingDeleted: () => invoke<{ total: number; deleted: number; active: number }>('get_all_trades_including_deleted'),
  restoreAllTrades: () => invoke<number>('restore_all_trades'),
  deleteAllTrades: () => invoke<number>('delete_all_trades'),

  // Stats
  getDashboardStats: (dateRange?: string) => invoke<DashboardStats>('get_dashboard_stats', { dateRange }),
  getEquityCurve: (dateRange?: string) => invoke<EquityCurvePoint[]>('get_equity_curve', { dateRange }),

  // Import/Export
  previewBitgetImport: (csvContent: string, portfolio: number, rPercent: number) =>
    invoke<ImportPreview[]>('preview_bitget_import', { csvContent, portfolio, rPercent }),
  importBitgetCsv: (csvContent: string, portfolio: number, rPercent: number) =>
    invoke<ImportResult>('import_bitget_csv', { csvContent, portfolio, rPercent }),
  deleteBitgetTrades: () => invoke<number>('delete_bitget_trades'),
  exportAllData: () => invoke<string>('export_all_data'),
  importAllData: (jsonData: string) => invoke<[number, number]>('import_all_data', { jsonData }),

  // API Credentials
  saveApiCredentials: (input: ApiCredentialInput) =>
    invoke<ApiCredentialSafe>('save_api_credentials', { input }),
  listApiCredentials: () =>
    invoke<ApiCredentialSafe[]>('list_api_credentials'),
  testApiCredentials: (credentialId: string) =>
    invoke<boolean>('test_api_credentials', { credentialId }),
  deleteApiCredentials: (credentialId: string) =>
    invoke<void>('delete_api_credentials', { credentialId }),
  updateApiCredentialsStatus: (credentialId: string, isActive: boolean) =>
    invoke<void>('update_api_credentials_status', { credentialId, isActive }),

  // API Sync
  getSyncHistory: (credentialId: string) =>
    invoke<ApiSyncHistory[]>('get_sync_history', { credentialId }),
  syncExchangeTrades: (config: SyncConfig) =>
    invoke<SyncResult>('sync_exchange_trades', { config }),
  updateAutoSyncSettings: (credentialId: string, autoSyncEnabled: boolean, autoSyncInterval: number) =>
    invoke<void>('update_auto_sync_settings', { credentialId, autoSyncEnabled, autoSyncInterval }),
  reloadSyncScheduler: () =>
    invoke<void>('reload_sync_scheduler'),

  // Positions
  fetchCurrentPositions: (credentialId: string) =>
    invoke<Position[]>('fetch_current_positions', { credentialId }),

  // Open Orders
  fetchOpenOrders: (request: FetchOpenOrdersRequest) =>
    invoke<OpenOrder[]>('fetch_open_orders', { request }),

  // Live Mirroring
  startLiveMirroring: (credentialId: string) =>
    invoke<void>('start_live_mirroring', { credentialId }),
  stopLiveMirroring: (credentialId: string) =>
    invoke<void>('stop_live_mirroring', { credentialId }),
  isLiveMirroringActive: (credentialId: string) =>
    invoke<boolean>('is_live_mirroring_active', { credentialId }),
  toggleLiveMirroring: (credentialId: string, enabled: boolean) =>
    invoke<void>('toggle_live_mirroring', { credentialId, enabled }),
  getLiveMirroringStatus: () =>
    invoke<LiveMirrorStatus[]>('get_live_mirroring_status'),
};
