import { NewTrade } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';

export interface BitGetCSVRow {
  futures: string;
  openingTime: string;
  avgEntryPrice: string;
  avgClosingPrice: string;
  closedAmount: string;
  closedValue: string;
  positionPnl: string;
  realizedPnL: string;
  fees: string;
  openingFee: string;
  closingFee: string;
  closedTime: string;
}

export interface ImportedTrade {
  pair: string;
  positionType: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  realizedPnL: number;
  openingTime: Date;
  closingTime: Date;
  totalFees: number;
}

/**
 * Parse BitGet CSV line into structured data
 */
export function parseBitGetCSVRow(line: string): BitGetCSVRow | null {
  // Remove BOM if present
  const cleanLine = line.replace(/^\uFEFF/, '');

  // Split by comma - BitGet CSV uses simple comma separation
  const fields = cleanLine.split(',').map(f => f.trim());

  if (fields.length < 12) {
    return null;
  }

  return {
    futures: fields[0],
    openingTime: fields[1],
    avgEntryPrice: fields[2],
    avgClosingPrice: fields[3],
    closedAmount: fields[4],
    closedValue: fields[5],
    positionPnl: fields[6],
    realizedPnL: fields[7],
    fees: fields[8],
    openingFee: fields[9],
    closingFee: fields[10],
    closedTime: fields[11],
  };
}

/**
 * Extract pair and position type from "Futures" column
 * Example: "INJUSDT Short·Isolated" -> { pair: "INJ/USDT", type: "SHORT" }
 */
export function parseFuturesField(futures: string): { pair: string; type: 'LONG' | 'SHORT' } | null {
  const match = futures.match(/^([A-Z0-9]+USDT)\s+(Long|Short)/i);
  if (!match) return null;

  const rawPair = match[1];
  const type = match[2].toUpperCase() as 'LONG' | 'SHORT';

  // Convert "INJUSDT" to "INJ/USDT"
  const pair = rawPair.replace(/USDT$/, '/USDT');

  return { pair, type };
}

/**
 * Extract numeric value from string with currency suffix
 * Example: "1645.2INJ" -> 1645.2, "-90.354813265386USDT" -> -90.354813265386
 */
export function parseNumericValue(value: string): number {
  const match = value.match(/^(-?\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Parse timestamp from BitGet format
 * Example: "2026-01-25 17:21:15"
 */
export function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp.replace(' ', 'T') + 'Z');
}

/**
 * Convert BitGet CSV row to ImportedTrade
 */
export function convertBitGetRowToImportedTrade(row: BitGetCSVRow): ImportedTrade | null {
  const futuresInfo = parseFuturesField(row.futures);
  if (!futuresInfo) return null;

  const entryPrice = parseFloat(row.avgEntryPrice);
  const exitPrice = parseFloat(row.avgClosingPrice);
  const quantity = parseNumericValue(row.closedAmount);
  const realizedPnL = parseNumericValue(row.realizedPnL);
  const openingTime = parseTimestamp(row.openingTime);
  const closingTime = parseTimestamp(row.closedTime);
  const openingFee = Math.abs(parseNumericValue(row.openingFee));
  const closingFee = Math.abs(parseNumericValue(row.closingFee));
  const totalFees = openingFee + closingFee;

  return {
    pair: futuresInfo.pair,
    positionType: futuresInfo.type,
    entryPrice,
    exitPrice,
    quantity,
    realizedPnL,
    openingTime,
    closingTime,
    totalFees,
  };
}

/**
 * Determine trade status from P&L
 */
function determineStatus(pnl: number): 'WIN' | 'LOSS' | 'BE' {
  if (pnl > 1) return 'WIN'; // More than $1 profit
  if (pnl < -1) return 'LOSS'; // More than $1 loss
  return 'BE';
}

/**
 * Generate unique fingerprint for BitGet trade to detect duplicates
 * Uses: pair, positionType, entry time, exit time, quantity, and PnL
 */
export function generateTradeFingerprint(imported: ImportedTrade): string {
  const parts = [
    'bitget', // Source
    imported.pair.toLowerCase(),
    imported.positionType.toLowerCase(),
    imported.openingTime.toISOString(),
    imported.closingTime.toISOString(),
    imported.quantity.toFixed(8),
    imported.realizedPnL.toFixed(8),
  ];
  return parts.join('|');
}

/**
 * Calculate effective RR from actual trade
 */
function calculateActualRR(
  positionType: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  stopLoss: number
): number {
  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance === 0) return 0;

  if (positionType === 'LONG') {
    const tpDistance = exitPrice - entryPrice;
    return tpDistance / slDistance;
  } else {
    const tpDistance = entryPrice - exitPrice;
    return tpDistance / slDistance;
  }
}

/**
 * Estimate stop loss from P&L and position settings
 * This estimates where SL would be if we risked the configured R%
 */
function estimateStopLoss(
  positionType: 'LONG' | 'SHORT',
  entryPrice: number,
  realizedPnL: number,
  quantity: number,
  portfolio: number,
  rPercent: number
): number {
  // Target 1R based on portfolio settings
  const targetOneR = portfolio * rPercent;

  // Calculate what SL distance would give us this 1R
  // For a position: 1R = quantity * slDistance
  const targetSlDistance = targetOneR / quantity;

  if (positionType === 'LONG') {
    // For long: SL is below entry
    return entryPrice - targetSlDistance;
  } else {
    // For short: SL is above entry
    return entryPrice + targetSlDistance;
  }
}

/**
 * Estimate leverage from position size and assumed margin
 * BitGet uses isolated margin, common leverage is 10-20x for futures
 */
function estimateLeverage(entryPrice: number, quantity: number): number {
  // Position size in USDT
  const positionSize = quantity * entryPrice;

  // Assume typical leverage based on position size
  // Smaller positions often use higher leverage
  if (positionSize < 1000) return 20;
  if (positionSize < 5000) return 15;
  if (positionSize < 10000) return 10;
  return 10; // Default to 10x for larger positions
}

/**
 * Convert ImportedTrade to our Trade schema
 */
export function convertImportedTradeToTrade(
  imported: ImportedTrade,
  portfolio: number,
  rPercent: number
): Partial<NewTrade> {
  // Calculate position size (quantity * entry price)
  const positionSize = imported.quantity * imported.entryPrice;

  // We cannot calculate accurate RR without knowing the actual stop loss
  // BitGet doesn't provide SL data, so we leave RR metrics as null
  const oneR = portfolio * rPercent;

  // Estimate stop loss for display purposes only
  const estimatedSL = estimateStopLoss(
    imported.positionType,
    imported.entryPrice,
    imported.realizedPnL,
    imported.quantity,
    portfolio,
    rPercent
  );

  // Calculate a reasonable leverage for validation
  const slDistance_PCT = Math.abs(imported.entryPrice - estimatedSL) / imported.entryPrice;
  const maxLeverage = Math.max(1, Math.floor(1 / slDistance_PCT));
  const leverage = Math.min(maxLeverage, 20); // Cap at 20x for realism

  // Calculate margin (position size / leverage)
  const margin = positionSize / leverage;

  // Determine status
  const status = determineStatus(imported.realizedPnL);

  // Generate unique fingerprint for duplicate detection
  const fingerprint = generateTradeFingerprint(imported);

  return {
    id: uuidv4(),
    pair: imported.pair,
    exchange: 'BitGet',
    positionType: imported.positionType,
    analysisDate: imported.openingTime,
    tradeDate: imported.openingTime,
    closeDate: imported.closingTime,

    // Portfolio snapshot
    portfolioValue: portfolio,
    rPercent,
    minRR: -100000000, // Set extremely low to bypass validation for imported trades

    // Planned setup - DO NOT FILL for imported trades (we don't know the plan)
    plannedPE: imported.entryPrice,
    plannedSL: estimatedSL,
    leverage,
    plannedTPs: [{
      price: imported.exitPrice,
      percent: 1.0,
      rr: 0 // No planned RR for imported trades
    }],

    // Calculated values
    positionSize,
    quantity: imported.quantity,
    margin,
    oneR,
    plannedWeightedRR: 0, // DO NOT FILL - imported trades don't have planned RR

    // Execution (using actual values from BitGet)
    effectivePE: imported.entryPrice,
    exits: [
      {
        type: 'TP1',
        price: imported.exitPrice,
        percent: 1.0,
        pnl: imported.realizedPnL,
        rr: 0, // Cannot calculate without actual SL
      },
    ],

    // Results - RR metrics left null because we don't have SL data
    totalPnL: imported.realizedPnL,
    pnlInR: null, // Cannot calculate without knowing actual 1R/SL
    effectiveWeightedRR: null, // Cannot calculate without actual SL data
    status,
    notes: `Imported from BitGet | Fees: $${imported.totalFees.toFixed(2)} | Note: RR metrics unavailable (no SL data from BitGet)`,
    importFingerprint: fingerprint, // For duplicate detection
  };
}

/**
 * Parse entire CSV file and convert to trades
 */
export async function parseBitGetCSV(
  csvContent: string,
  portfolio: number,
  rPercent: number
): Promise<{
  trades: Partial<NewTrade>[];
  errors: Array<{ line: number; error: string }>;
}> {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const trades: Partial<NewTrade>[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  // Skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    try {
      const row = parseBitGetCSVRow(line);
      if (!row) {
        errors.push({ line: i + 1, error: 'Failed to parse CSV row' });
        continue;
      }

      const imported = convertBitGetRowToImportedTrade(row);
      if (!imported) {
        errors.push({ line: i + 1, error: 'Failed to extract trade data from futures field' });
        continue;
      }

      const trade = convertImportedTradeToTrade(imported, portfolio, rPercent);
      trades.push(trade);
    } catch (error) {
      errors.push({
        line: i + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { trades, errors };
}
