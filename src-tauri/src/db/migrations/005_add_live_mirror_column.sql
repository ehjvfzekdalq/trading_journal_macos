-- Migration 005: Add live_mirror_enabled column
-- Reason: Support live mirroring of exchange positions
-- Date: 2026-02-04
-- Breaking: No (has default value)

ALTER TABLE api_credentials ADD COLUMN live_mirror_enabled INTEGER NOT NULL DEFAULT 0;
