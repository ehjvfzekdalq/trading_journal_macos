-- Migration 003: Add import_source column
-- Reason: Track how trades were created (manual vs API import)
-- Date: 2026-02-04
-- Breaking: No (has default value)

ALTER TABLE trades ADD COLUMN import_source TEXT NOT NULL DEFAULT 'USER_CREATED';
