/**
 * App-wide color constants.
 *
 * These are the single source of truth for the two primary semantic colors.
 * Update here to change green/red everywhere in the app (charts, SVGs, etc.)
 *
 * The equivalent CSS variables (for Tailwind utility classes) live in src/index.css:
 *   --success:     89 20% 61%   (green)
 *   --destructive: 358 94% 62%  (red)
 */

/** Green — profits, wins, long positions, success states */
export const PROFIT_COLOR = "#72bf6a";

/** Red — losses, errors, short positions, danger states */
export const LOSS_COLOR = "#f94449";
