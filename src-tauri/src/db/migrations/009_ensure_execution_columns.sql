-- Migration 009: Ensure execution calculation columns exist for all installations
-- Migration 007 was a no-op (SELECT 1) designed for the developer's DB where these columns
-- were added manually. Fresh installs never received these columns.
-- The migration runner handles "duplicate column" errors gracefully so this is safe to run
-- even on databases that already have these columns.
ALTER TABLE trades ADD COLUMN execution_portfolio REAL;
ALTER TABLE trades ADD COLUMN execution_r_percent REAL;
ALTER TABLE trades ADD COLUMN execution_margin REAL;
ALTER TABLE trades ADD COLUMN execution_position_size REAL;
ALTER TABLE trades ADD COLUMN execution_quantity REAL;
ALTER TABLE trades ADD COLUMN execution_one_r REAL;
ALTER TABLE trades ADD COLUMN execution_potential_profit REAL;
