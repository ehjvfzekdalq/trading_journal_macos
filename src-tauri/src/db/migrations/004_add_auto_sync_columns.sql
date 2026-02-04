-- Migration 004: Add auto_sync_enabled and auto_sync_interval columns
-- Reason: Support automatic periodic syncing with exchange APIs
-- Date: 2026-02-04
-- Breaking: No (has default values)

ALTER TABLE api_credentials ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_credentials ADD COLUMN auto_sync_interval INTEGER NOT NULL DEFAULT 3600;
