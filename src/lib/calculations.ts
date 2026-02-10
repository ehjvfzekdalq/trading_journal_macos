/**
 * Trading calculation formulas
 * Based on the specifications in trading_dashboard_specs.md
 */

export type PositionType = 'LONG' | 'SHORT' | 'UNDEFINED';

/**
 * Determine position type based on entry and take profit prices
 */
export function getPositionType(pe: number, tp: number): PositionType {
  if (tp > pe) return 'LONG';
  if (tp < pe) return 'SHORT';
  return 'UNDEFINED';
}

/**
 * Calculate weighted average entry price from multiple entries
 * @param entries Array of {price, percent} where percent is 0-100
 * @returns Weighted average price
 */
export function calculateWeightedEntry(
  entries: Array<{ price: number; percent: number }>
): number {
  const validEntries = entries.filter(e => e.price > 0 && e.percent > 0);
  if (validEntries.length === 0) {
    throw new Error('At least one entry with valid price and percent is required');
  }

  const totalPercent = validEntries.reduce((sum, e) => sum + e.percent, 0);
  if (totalPercent === 0) {
    throw new Error('Total entry allocation percent must be greater than 0');
  }

  const weightedSum = validEntries.reduce(
    (sum, e) => sum + e.price * e.percent,
    0
  );
  return weightedSum / totalPercent;
}

/**
 * Calculate 1R (risk per trade in dollars)
 */
export function calculateOneR(portfolio: number, rPercent: number): number {
  return portfolio * rPercent;
}

/**
 * Calculate distances between price levels
 */
export function calculateDistances(
  type: PositionType,
  pe: number,
  sl: number,
  tp: number
) {
  const distanceSL_USD = type === 'LONG' ? pe - sl : sl - pe;
  const distanceTP_USD = type === 'LONG' ? tp - pe : pe - tp;
  const distanceSL_PCT = Math.abs(distanceSL_USD) / pe;
  const distanceTP_PCT = Math.abs(distanceTP_USD) / pe;

  return {
    distanceSL_USD,
    distanceTP_USD,
    distanceSL_PCT,
    distanceTP_PCT,
  };
}

/**
 * Calculate Risk:Reward ratio
 */
export function calculateRR(distanceTP_USD: number, distanceSL_USD: number): number | null {
  if (distanceSL_USD === 0) return null;
  const result = Math.abs(distanceTP_USD) / Math.abs(distanceSL_USD);
  if (!isFinite(result)) return null;
  return result;
}

/**
 * Calculate maximum safe leverage (isolated margin)
 */
export function calculateMaxLeverage(distanceSL_PCT: number): number | null {
  if (distanceSL_PCT === 0) return null;
  const result = Math.floor(1 / distanceSL_PCT);
  if (!isFinite(result)) return null;
  return result;
}

/**
 * Calculate position sizing (margin and position size)
 */
export function calculatePositionSize(
  oneR: number,
  distanceSL_PCT: number,
  leverage: number
): { margin: number; positionSize: number; quantity: number } | null {
  const lossPctAtSL = distanceSL_PCT * leverage;
  if (lossPctAtSL === 0) return null;

  const margin = oneR / lossPctAtSL;
  const positionSize = margin * leverage;

  return { margin, positionSize, quantity: 0 }; // quantity calculated separately
}

/**
 * Calculate quantity based on position size and entry price
 */
export function calculateQuantity(positionSize: number, pe: number): number {
  if (pe === 0) return 0;
  return positionSize / pe;
}

/**
 * Calculate potential profit at take profit level
 */
export function calculatePotentialProfit(
  positionSize: number,
  distanceTP_PCT: number
): number {
  return positionSize * distanceTP_PCT;
}

/**
 * Calculate individual TP Risk:Reward ratio
 */
export function calculateTPRR(
  type: PositionType,
  tpPrice: number,
  pe: number,
  sl: number
): number {
  if (pe === sl) return 0;

  if (type === 'LONG') {
    return (tpPrice - pe) / (pe - sl);
  } else {
    return (pe - tpPrice) / (sl - pe);
  }
}

/**
 * Calculate weighted average RR for multiple take profits
 */
export function calculateWeightedRR(
  tps: Array<{ price: number; percent: number; rr: number }>
): number {
  const totalPercent = tps.reduce((sum, tp) => sum + tp.percent, 0);
  if (totalPercent === 0) return 0;

  const weightedSum = tps.reduce((sum, tp) => sum + tp.percent * tp.rr, 0);
  return weightedSum / totalPercent;
}

/**
 * Calculate P&L for an exit
 */
export function calculateExitPnL(
  type: PositionType,
  exitPrice: number,
  effectivePE: number,
  positionSize: number,
  exitPercent: number
): number | null {
  if (!effectivePE || !exitPrice || !exitPercent) return null;

  const priceChange =
    type === 'LONG'
      ? (exitPrice - effectivePE) / effectivePE
      : (effectivePE - exitPrice) / effectivePE;

  return priceChange * positionSize * exitPercent;
}

/**
 * Calculate effective RR for an exit
 */
export function calculateEffectiveRR(
  type: PositionType,
  exitPrice: number,
  effectivePE: number,
  sl: number
): number {
  if (effectivePE === sl) return 0;

  if (type === 'LONG') {
    return (exitPrice - effectivePE) / (effectivePE - sl);
  } else {
    return (effectivePE - exitPrice) / (sl - effectivePE);
  }
}

/**
 * Determine trade result based on exits
 */
export function determineResult(totalExitPercent: number, totalPnL: number): 'OPEN' | 'WIN' | 'LOSS' | 'BE' {
  if (totalExitPercent === 0) return 'OPEN';
  if (totalPnL > 0) return 'WIN';
  if (totalPnL < 0) return 'LOSS';
  return 'BE';
}

/**
 * Calculate win rate
 */
export function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return wins / total;
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(
  trades: Array<{ totalPnL: number | null }>
): number {
  const grossProfit = trades
    .filter((t) => t.totalPnL && t.totalPnL > 0)
    .reduce((sum, t) => sum + (t.totalPnL || 0), 0);

  const grossLoss = Math.abs(
    trades
      .filter((t) => t.totalPnL && t.totalPnL < 0)
      .reduce((sum, t) => sum + (t.totalPnL || 0), 0)
  );

  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  const result = grossProfit / grossLoss;
  if (!isFinite(result)) return Infinity;
  return result;
}

/**
 * Calculate expectancy
 */
export function calculateExpectancy(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  return winRate * avgWin - (1 - winRate) * Math.abs(avgLoss);
}

/**
 * Complete trade calculation
 * Returns all calculated values for a trade setup
 */
export function calculateTradeMetrics(params: {
  portfolio: number;
  rPercent: number;
  pe?: number;  // DEPRECATED: use entries instead
  entries?: Array<{ price: number; percent: number }>;  // NEW: multi-PE support
  sl: number;
  tps: Array<{ price: number; percent: number }>;
  leverage: number;
}) {
  const { portfolio, rPercent, sl, tps, leverage } = params;

  // Calculate weighted PE from entries (or use legacy single PE)
  let weightedPE: number;
  try {
    weightedPE = params.entries && params.entries.length > 0
      ? calculateWeightedEntry(params.entries)
      : params.pe || 0;
  } catch (error) {
    throw new Error('Invalid entry configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }

  const pe = weightedPE;

  if (pe === 0) {
    throw new Error('Entry price cannot be zero');
  }

  // Basic calculations
  const oneR = calculateOneR(portfolio, rPercent);
  const firstTP = tps[0]?.price || pe;
  const type = getPositionType(pe, firstTP);

  // Use SL for distance calculations (not first TP)
  const distanceSL_USD = type === 'LONG' ? pe - sl : sl - pe;
  const distanceSL_PCT = Math.abs(distanceSL_USD) / pe;

  // Position sizing
  const maxLeverage = calculateMaxLeverage(distanceSL_PCT);
  const sizing = calculatePositionSize(oneR, distanceSL_PCT, leverage);

  if (!sizing) {
    throw new Error('Invalid position sizing calculation');
  }

  const quantity = calculateQuantity(sizing.positionSize, pe);

  // Calculate RR and potential profit for each TP
  const tpsWithRR = tps.map((tp) => {
    const rr = calculateTPRR(type, tp.price, pe, sl);

    // Calculate distance to this TP
    const distanceTP_USD = type === 'LONG' ? tp.price - pe : pe - tp.price;
    const distanceTP_PCT = Math.abs(distanceTP_USD) / pe;

    // Calculate potential profit for this TP weighted by its allocation
    const tpProfit = sizing.positionSize * distanceTP_PCT * tp.percent;

    return {
      ...tp,
      rr,
      potentialProfit: tpProfit,
    };
  });

  const plannedWeightedRR = calculateWeightedRR(tpsWithRR);

  // Sum weighted potential profits across all TPs
  const potentialProfit = tpsWithRR.reduce((sum, tp) => sum + tp.potentialProfit, 0);

  return {
    type,
    oneR,
    weightedPE,  // NEW: include weighted entry price
    distances: {
      distanceSL_USD,
      distanceSL_PCT,
      // For backwards compatibility, include first TP distance
      distanceTP_USD: type === 'LONG' ? firstTP - pe : pe - firstTP,
      distanceTP_PCT: Math.abs(type === 'LONG' ? firstTP - pe : pe - firstTP) / pe,
    },
    maxLeverage,
    margin: sizing.margin,
    positionSize: sizing.positionSize,
    quantity,
    tpsWithRR,
    plannedWeightedRR,
    potentialProfit,
  };
}

/**
 * Calculate execution metrics based on actual exits
 */
export function calculateExecutionMetrics(params: {
  pe?: number;  // DEPRECATED: use entries instead
  entries?: Array<{ price: number; percent: number }>;  // NEW: multi-PE support
  sl: number;
  exits: Array<{ price: number; percent: number }>;
  oneR: number;
  positionSize: number;
  type: string;
}) {
  const { sl, exits, oneR, type } = params;

  // Calculate weighted effective PE from filled entries (or use legacy single PE)
  let weightedPE: number;
  try {
    weightedPE = params.entries && params.entries.length > 0
      ? calculateWeightedEntry(params.entries)
      : params.pe || 0;
  } catch (error) {
    throw new Error('Invalid entry configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }

  const pe = weightedPE;

  if (pe === 0) {
    throw new Error('Entry price cannot be zero for execution metrics');
  }

  const distanceSL_USD = type === 'LONG' ? pe - sl : sl - pe;

  let realizedPnl = 0;
  let totalRMultiple = 0;
  let totalExitPercent = 0;

  // Calculate realized P&L from actual exits
  exits.forEach(exit => {
    const exitDistance = type === 'LONG' ? exit.price - pe : pe - exit.price;
    const rMultiple = exitDistance / distanceSL_USD;
    const exitPnl = oneR * rMultiple * exit.percent;

    realizedPnl += exitPnl;
    totalRMultiple += rMultiple * exit.percent;
    totalExitPercent += exit.percent;
  });

  // Calculate weighted average exit price
  let weightedExitPrice = 0;
  if (totalExitPercent > 0) {
    weightedExitPrice = exits.reduce((sum, exit) => sum + exit.price * exit.percent, 0) / totalExitPercent;
  }

  // Calculate total P&L if 100% of position was closed at weighted average exit price
  const exitDistance = type === 'LONG' ? weightedExitPrice - pe : pe - weightedExitPrice;
  const totalRMultipleIfComplete = exitDistance / distanceSL_USD;
  const totalPnl = oneR * totalRMultipleIfComplete;

  const effectiveRR = totalRMultiple;

  return {
    totalPnl,  // P&L if 100% position closed at weighted avg exit price
    realizedPnl,  // P&L from actual partial exits
    effectiveRR,
  };
}
