-- Bootstrap migration that creates the version tracking table
-- This is migration 000 and is always applied first

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    checksum TEXT,  -- NULL for legacy migrations detected via introspection
    execution_time_ms INTEGER NOT NULL,
    notes TEXT  -- e.g., "Legacy migration - detected via introspection"
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
ON schema_migrations(applied_at);
