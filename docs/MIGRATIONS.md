# Database Migration System

## Overview

The trading journal uses a forward-only SQL migration system to manage database schema changes. This ensures:

- **Zero data loss** during updates via automatic backups
- **Version tracking** with checksums to detect tampering
- **Automatic backups** before migrations
- **Transactional safety** with rollback on failure
- **Backwards compatibility** with legacy databases

## Architecture

### Core Components

1. **Migration Files** (`src-tauri/src/db/migrations/*.sql`)
   - Sequential numbered files (000, 001, 002, ...)
   - Embedded in binary via `include_str!()`
   - Pure SQL (no Rust hooks in v1.0)

2. **MigrationRunner** (`src-tauri/src/db/migration_runner.rs`)
   - Core engine that applies migrations
   - Handles legacy database detection
   - Creates backups before migrations
   - Verifies migration integrity

3. **Version Tracking** (`schema_migrations` table)
   - Records applied migrations
   - Stores checksums to detect file modifications
   - Tracks execution time and notes

### Migration Workflow

```
App Start
    ↓
Open Database
    ↓
Check for schema_migrations table
    ↓
    ├─→ [NOT FOUND] → Detect Legacy Version → Bootstrap
    │                      ↓
    │                  Apply Migration 000
    │                      ↓
    │                  Mark Legacy Migrations as Applied
    │
    └─→ [FOUND] → Get Current Version
                       ↓
                  Find Pending Migrations
                       ↓
                  Create Backup (if pending)
                       ↓
                  Apply Migrations Sequentially
                       ↓
                  Verify Checksums
                       ↓
                  App Ready
```

## How to Add a New Migration

### Step 1: Create Migration File

Create a new file in `src-tauri/src/db/migrations/` with the next sequential number:

```bash
# Example: Adding migration 006
touch src-tauri/src/db/migrations/006_add_tags_table.sql
```

### Step 2: Write Migration SQL

Use the template format:

```sql
-- Migration 006: Add tags table for trade categorization
-- Reason: Allow users to tag trades with custom categories
-- Date: 2026-02-05
-- Breaking: No

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (trade_id, tag_id),
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trade_tags_trade ON trade_tags(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_tags_tag ON trade_tags(tag_id);
```

### Step 3: Register Migration

Add the migration to `migration_runner.rs`:

```rust
fn collect_migrations() -> Vec<Migration> {
    vec![
        // ... existing migrations ...
        Migration::new(
            6,
            "add_tags_table",
            include_str!("migrations/006_add_tags_table.sql"),
        ),
    ]
}
```

### Step 4: Test Locally

```bash
# Run unit tests
cargo test --package trading-journal migration

# Test with fresh database
rm ~/Library/Application\ Support/com.trading-journal.app/trading_journal.db
cargo run

# Test with existing database (copy from another install)
cargo run
```

### Step 5: Verify

- [ ] Check logs for successful migration
- [ ] Verify backup was created in `backups/` folder
- [ ] Check `schema_migrations` table for new record
- [ ] Test app functionality with new schema
- [ ] Run all tests: `cargo test`

## Migration Patterns

### Adding a Column

```sql
-- Simple column addition
ALTER TABLE table_name ADD COLUMN new_column TEXT;

-- With default value
ALTER TABLE table_name ADD COLUMN new_column TEXT NOT NULL DEFAULT 'value';

-- With constraint
ALTER TABLE table_name ADD COLUMN status TEXT CHECK(status IN ('ACTIVE', 'INACTIVE'));
```

### Creating a Table

```sql
CREATE TABLE IF NOT EXISTS new_table (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_new_table_name ON new_table(name);
```

### Adding Foreign Keys

```sql
CREATE TABLE IF NOT EXISTS child_table (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES parent_table(id) ON DELETE CASCADE
);
```

### Renaming Columns (SQLite Workaround)

SQLite doesn't support `ALTER TABLE ... RENAME COLUMN` in older versions. Use this pattern:

```sql
-- 1. Create new table with correct schema
CREATE TABLE trades_new (
    id TEXT PRIMARY KEY,
    new_column_name TEXT NOT NULL,  -- renamed column
    -- ... other columns ...
);

-- 2. Copy data
INSERT INTO trades_new
SELECT id, old_column_name, ...
FROM trades;

-- 3. Drop old table
DROP TABLE trades;

-- 4. Rename new table
ALTER TABLE trades_new RENAME TO trades;

-- 5. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_trades_new_column ON trades(new_column_name);
```

### Data Transformations

For complex transformations, use SQL:

```sql
-- Split a JSON field into multiple columns
ALTER TABLE trades ADD COLUMN entry_price REAL;
ALTER TABLE trades ADD COLUMN exit_price REAL;

UPDATE trades
SET entry_price = json_extract(execution_data, '$.entry'),
    exit_price = json_extract(execution_data, '$.exit');
```

## Best Practices

### DO:

✅ **Test migrations thoroughly** before deploying
✅ **Make migrations backwards compatible** when possible
✅ **Use descriptive names** for migrations
✅ **Add comments** explaining why the change is needed
✅ **Keep migrations small and focused** on one change
✅ **Use transactions** (automatic in our system)
✅ **Add indexes** for new columns that will be queried

### DON'T:

❌ **Don't modify existing migration files** after they're deployed
❌ **Don't skip version numbers** - keep sequential
❌ **Don't use Rust-specific syntax** in SQL (keep it pure SQL)
❌ **Don't forget to test with legacy databases**
❌ **Don't create breaking changes** without planning for data migration
❌ **Don't use database-specific features** (stick to SQLite standard)

## Troubleshooting

### Migration Failed

If a migration fails:

1. **Check the error message** - it will show which migration failed
2. **Database is rolled back** - the failed migration didn't apply
3. **Backup is available** - restore from `backups/` folder if needed
4. **Fix the migration** - correct the SQL and try again

### Checksum Mismatch

If you see "CHECKSUM MISMATCH" error:

```
❌ CHECKSUM MISMATCH for migration 3 (add_import_source)
Expected: abc123...
Actual:   def456...
```

**This means:**
- A migration file was modified after it was applied
- This is dangerous and could cause database inconsistencies

**Solution:**
1. Restore the original migration file from git
2. If you need to change it, create a new migration instead
3. Never modify deployed migrations

### Database Corrupted

If the database is corrupted:

1. **Check backups folder**: `~/Library/Application Support/com.trading-journal.app/backups/`
2. **Find most recent backup**: `pre_migration_vX_TIMESTAMP.db`
3. **Replace database**: Copy backup to `trading_journal.db`
4. **Restart app**: Migrations will run again from backup state

### Legacy Database Not Detected

If upgrading from v1.1.1 and migrations don't run:

1. Check logs for "Legacy database detected" message
2. Verify `detect_legacy_version()` logic in `migration_runner.rs`
3. Check that columns exist using SQLite browser
4. File a bug report with your database schema

## Testing

### Unit Tests

Tests are located in `migration_runner.rs`:

```bash
# Run all migration tests
cargo test --package trading-journal migration

# Run specific test
cargo test test_fresh_install
```

### Integration Tests

Located in `src-tauri/tests/migration_tests.rs`:

```bash
# Run integration tests
cargo test --test migration_tests
```

### Manual Testing

```bash
# 1. Test fresh install
rm ~/Library/Application\ Support/com.trading-journal.app/trading_journal.db
cargo run

# 2. Test upgrade from v1.1.1
# (Copy database from v1.1.1 install)
cargo run

# 3. Test with large database
# (Import 10,000+ trades)
cargo run
```

## System Details

### Backup System

- **When**: Before applying any pending migrations
- **Where**: `{app_data_dir}/backups/`
- **Format**: `pre_migration_v{version}_{timestamp}.db`
- **Retention**: Last 5 backups (auto-cleanup)
- **Method**: rusqlite Backup API (ensures consistency)

### Version Detection

Legacy databases (v1.1.1) are detected by:

1. Check if `schema_migrations` table exists
2. If not, introspect schema using `pragma_table_info`
3. Check for columns in reverse order (newest to oldest)
4. Determine highest applied migration version

### Migration Recording

Each migration is recorded in `schema_migrations`:

```sql
INSERT INTO schema_migrations (
    version,              -- Migration number (0, 1, 2, ...)
    name,                 -- Migration name
    applied_at,           -- Unix timestamp
    checksum,             -- SHA-256 of SQL (NULL for legacy)
    execution_time_ms,    -- How long it took
    notes                 -- Optional notes
) VALUES (?, ?, ?, ?, ?, ?);
```

## FAQ

**Q: Can I rollback a migration?**
A: No. This system is forward-only. Use backups to restore previous state if needed.

**Q: What happens if I modify a deployed migration?**
A: Checksum verification will detect the change and block app startup. Don't do this.

**Q: How do I handle breaking schema changes?**
A: Create a new migration that preserves data. Use the "Renaming Columns" pattern above.

**Q: Can I run migrations manually?**
A: No need. Migrations run automatically on app startup.

**Q: What if a migration takes too long?**
A: For large databases, migrations might take a few seconds. The app will wait.

**Q: How do I know which migrations have been applied?**
A: Query the `schema_migrations` table or check logs on app startup.

**Q: Can I add Rust code to migrations?**
A: Not in v1.0. Use pure SQL only. Rust hooks may be added in future versions if needed.

## References

- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [SQLite Pragma Table Info](https://www.sqlite.org/pragma.html#pragma_table_info)
- [rusqlite Backup API](https://docs.rs/rusqlite/latest/rusqlite/backup/index.html)
- [Database Migration Best Practices](https://www.prisma.io/dataguide/types/relational/migration-best-practices)
