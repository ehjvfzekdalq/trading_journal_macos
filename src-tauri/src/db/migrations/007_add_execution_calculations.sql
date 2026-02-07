-- Add execution calculation fields to trades table
-- These fields allow users to override portfolio and R% values for execution-specific calculations
-- This migration handles the case where columns may already exist from manual addition

-- Since the columns already exist in the database (added manually),
-- this migration is automatically marked as applied by the legacy detection system.
-- We include a no-op statement to ensure valid SQL:
SELECT 1;
