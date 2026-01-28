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
  position_type: string;
  one_r: number;
  margin: number;
  position_size: number;
  quantity: number;
  planned_weighted_rr: number;
  effective_pe?: number;
  close_date?: number;
  exits?: string;
  effective_weighted_rr?: number;
  total_pnl?: number;
  pnl_in_r?: number;
  notes: string;
  import_fingerprint?: string;
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
  position_type: string;
  one_r: number;
  margin: number;
  position_size: number;
  quantity: number;
  planned_weighted_rr: number;
  notes: string;
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
  duplicateTrade: (id: string) => invoke<Trade>('duplicate_trade', { id }),
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
};
