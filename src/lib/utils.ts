import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format number as currency
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format number as percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format RR ratio
 */
export function formatRR(value: number): string {
  return `${value.toFixed(2)}:1`;
}

/**
 * Format leverage
 */
export function formatLeverage(value: number): string {
  return `${value}x`;
}

/**
 * Generate unique trade ID
 */
export function generateTradeId(): string {
  return `TRADE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Parse date from string
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download JSON file
 */
export function downloadJSON(data: any, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Date range type for filtering trades
 */
export type DateRange = 'all' | '7d' | '30d' | '90d' | '180d' | '365d';

/**
 * Convert date range to Unix timestamp (seconds)
 * @param range - The date range to convert
 * @returns Unix timestamp in seconds, or undefined for 'all'
 */
export function getDateRangeTimestamp(range: DateRange): number | undefined {
  if (range === 'all') return undefined;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (range) {
    case '7d': return Math.floor((now - 7 * day) / 1000);
    case '30d': return Math.floor((now - 30 * day) / 1000);
    case '90d': return Math.floor((now - 90 * day) / 1000);
    case '180d': return Math.floor((now - 180 * day) / 1000);
    case '365d': return Math.floor((now - 365 * day) / 1000);
    default: return undefined;
  }
}
