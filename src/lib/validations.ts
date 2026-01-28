import { z } from 'zod';

export const plannedTPSchema = z.object({
  price: z.number().positive('Price must be positive'),
  percent: z.number().min(0.01).max(1, 'Percent must be between 1% and 100%'),
  rr: z.number(),
});

export const exitSchema = z.object({
  type: z.enum(['TP1', 'TP2', 'TP3', 'TP4', 'BE', 'SL']),
  price: z.number().positive('Price must be positive'),
  percent: z.number().min(0.01).max(1, 'Percent must be between 1% and 100%'),
  rr: z.number(),
  pnl: z.number(),
});

export const tradeFormSchema = z.object({
  pair: z
    .string()
    .min(1, 'Trading pair is required')
    .regex(/^[A-Z]+\/[A-Z]+$/, 'Must be in format BTC/USDT'),
  exchange: z.string().min(1, 'Exchange is required'),
  analysisDate: z.date(),
  tradeDate: z.date(),
  portfolioValue: z.number().positive('Portfolio value must be positive'),
  rPercent: z
    .number()
    .min(0.001, 'R% must be at least 0.1%')
    .max(1, 'R% cannot exceed 100%'),
  minRR: z.number().positive('Minimum RR must be positive'),
  plannedPE: z.number().positive('Entry price must be positive'),
  plannedSL: z.number().positive('Stop loss must be positive'),
  leverage: z
    .number()
    .int()
    .min(1, 'Leverage must be at least 1x')
    .max(125, 'Leverage cannot exceed 125x'),
  plannedTPs: z
    .array(plannedTPSchema)
    .min(1, 'At least one take profit is required')
    .max(4, 'Maximum 4 take profits allowed'),
  notes: z.string().optional(),
  effectivePE: z.number().positive().optional().nullable(),
  closeDate: z.date().optional().nullable(),
  exits: z.array(exitSchema).optional(),
}).refine((data) => data.plannedPE !== data.plannedSL, {
  message: 'Entry price must not equal Stop Loss',
  path: ['plannedSL'],
}).refine((data) => {
  // Check that all TP prices are different from PE
  return data.plannedTPs.every(tp => tp.price !== data.plannedPE);
}, {
  message: 'Take Profit prices must not equal Entry Price',
  path: ['plannedTPs'],
});

export const calculatorFormSchema = z.object({
  portfolio: z.number().positive('Portfolio must be positive'),
  rPercent: z
    .number()
    .min(0.001, 'R% must be at least 0.1%')
    .max(1, 'R% cannot exceed 100%'),
  minRR: z.number().positive('Minimum RR must be positive'),
  pe: z.number().positive('Entry price must be positive'),
  sl: z.number().positive('Stop loss must be positive'),
  tp: z.number().positive('Take profit must be positive'),
  leverage: z
    .number()
    .int()
    .min(1, 'Leverage must be at least 1x')
    .max(125, 'Leverage cannot exceed 125x'),
});

export const settingsSchema = z.object({
  initialCapital: z.number().positive('Initial capital must be positive'),
  currentRPercent: z
    .number()
    .min(0.001, 'R% must be at least 0.1%')
    .max(1, 'R% cannot exceed 100%'),
  defaultMinRR: z.number().positive('Minimum RR must be positive'),
  defaultLeverage: z
    .number()
    .int()
    .min(1, 'Leverage must be at least 1x')
    .max(125, 'Leverage cannot exceed 125x'),
  currency: z.string().default('USD'),
});

export type TradeFormValues = z.infer<typeof tradeFormSchema>;
export type CalculatorFormValues = z.infer<typeof calculatorFormSchema>;
export type SettingsFormValues = z.infer<typeof settingsSchema>;

/**
 * Validate trade before submission
 */
export function validateTrade(trade: {
  plannedWeightedRR: number;
  minRR: number;
  leverage: number;
  maxLeverage: number;
  totalTPPercent: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // RR check
  if (trade.plannedWeightedRR < trade.minRR) {
    errors.push(
      `RR (${trade.plannedWeightedRR.toFixed(2)}) is below minimum (${trade.minRR})`
    );
  }

  // Leverage check
  if (trade.leverage > trade.maxLeverage) {
    errors.push(
      `Leverage (${trade.leverage}x) exceeds max safe leverage (${trade.maxLeverage}x)`
    );
  }

  // TP allocation check
  if (Math.abs(trade.totalTPPercent - 1.0) > 0.001) {
    errors.push(
      `TP allocation (${(trade.totalTPPercent * 100).toFixed(0)}%) must equal 100%`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
