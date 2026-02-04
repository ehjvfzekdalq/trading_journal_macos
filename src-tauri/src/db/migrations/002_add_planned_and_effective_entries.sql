-- Migration 002: Add planned_entries and effective_entries columns
-- Reason: Support multi-entry trade planning feature
-- Date: 2026-02-04
-- Breaking: No (columns are nullable)

ALTER TABLE trades ADD COLUMN planned_entries TEXT;
ALTER TABLE trades ADD COLUMN effective_entries TEXT;
