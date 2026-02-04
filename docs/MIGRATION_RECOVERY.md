# Database Migration Recovery Guide

## Overview

This guide helps you recover from database migration issues. The trading journal automatically backs up your database before applying migrations, so your data is safe.

## Quick Recovery Steps

If the app won't start after an update:

1. **Close the application completely**
2. **Locate your backups folder**:
   - macOS: `~/Library/Application Support/com.trading-journal.app/backups/`
   - Linux: `~/.local/share/com.trading-journal.app/backups/`
   - Windows: `%APPDATA%\com.trading-journal.app\backups\`

3. **Find the most recent backup**:
   - Look for files like `pre_migration_v5_1738617600.db`
   - Higher version numbers and timestamps are newer

4. **Replace your database**:
   - Navigate to the app data directory (parent of `backups/`)
   - Rename `trading_journal.db` to `trading_journal.db.broken`
   - Copy the backup file and rename it to `trading_journal.db`

5. **Restart the application**

## Understanding Backup Files

### Backup Naming Convention

```
pre_migration_v{version}_{timestamp}.db

Example: pre_migration_v5_1738617600.db
         ↑              ↑  ↑
         |              |  Unix timestamp
         |              Target migration version
         Prefix
```

### What Each Backup Contains

- **Complete database snapshot** at the moment before migration
- **All your trades** up to that point
- **All settings** and configurations
- **All API credentials** (encrypted)

### Backup Retention

- System keeps **last 5 backups**
- Older backups are automatically deleted
- Each backup is verified for integrity before use

## Common Issues

### Issue 1: "Database initialization failed"

**Error Message:**
```
❌ Database initialization failed: ...
```

**Cause:** Migration failed during application startup

**Solution:**
1. Check the error message for which migration failed
2. Follow "Quick Recovery Steps" above
3. Report the issue with the error details

---

### Issue 2: "CHECKSUM MISMATCH"

**Error Message:**
```
❌ CHECKSUM MISMATCH for migration 3 (add_import_source)
Expected: abc123...
Actual:   def456...
```

**Cause:** A migration file was modified after it was applied

**Solution:**
1. This is a protective measure - your data is safe
2. Update to the latest version (migration files will be corrected)
3. If issue persists, follow "Quick Recovery Steps"

---

### Issue 3: App Won't Start After Update

**Symptoms:**
- App opens then immediately closes
- Stuck on loading screen
- Error dialog appears

**Solution:**
1. Check app logs (see "How to Find Logs" below)
2. Look for migration-related errors
3. Follow "Quick Recovery Steps" above
4. Report issue with logs

---

### Issue 4: Data Appears to be Missing

**Symptoms:**
- Trades are missing after update
- Settings reset to defaults

**Solution:**
1. **Don't panic** - your data is in the backup
2. Follow "Quick Recovery Steps" above
3. Verify data is restored
4. Report issue so we can prevent it

---

### Issue 5: "Backup integrity check failed"

**Error Message:**
```
Backup integrity check failed: ...
```

**Cause:** Backup file is corrupted

**Solution:**
1. Try an older backup (check the `backups/` folder)
2. Use the backup with the next-oldest timestamp
3. If all backups fail, your original database might still work
4. Contact support for help

## How to Find Logs

Logs contain detailed information about what went wrong.

### macOS
```bash
# Terminal command
tail -f ~/Library/Logs/com.trading-journal.app/app.log
```

Or check Console.app → search for "trading-journal"

### Linux
```bash
# Terminal command
tail -f ~/.local/share/com.trading-journal.app/logs/app.log
```

### Windows
```powershell
# Open PowerShell and run
Get-Content "$env:APPDATA\com.trading-journal.app\logs\app.log" -Wait -Tail 50
```

## Manual Database Recovery

If automatic backups don't work, you can manually recover your database.

### Step 1: Verify Database File

```bash
# macOS/Linux
cd ~/Library/Application\ Support/com.trading-journal.app/
ls -lh trading_journal.db

# Check if file exists and has non-zero size
```

### Step 2: Use SQLite Browser

1. Download [DB Browser for SQLite](https://sqlitebrowser.org/)
2. Open `trading_journal.db`
3. Verify tables exist: `trades`, `settings`, `api_credentials`
4. Check `schema_migrations` table for applied migrations

### Step 3: Export Data

If database opens but app won't start:

1. Open database in DB Browser
2. File → Export → Database to SQL file
3. Save as `backup_manual.sql`
4. Reinstall app (fresh install)
5. Stop app and replace database with backup

## Preventing Migration Issues

### Before Updating

1. **Backup your data** (app does this automatically, but manual backup is good)
   ```bash
   # macOS/Linux
   cp ~/Library/Application\ Support/com.trading-journal.app/trading_journal.db ~/Desktop/trading_journal_backup.db
   ```

2. **Check available disk space** (migrations need space for backups)
   - At least 2x your database size free

3. **Close the app completely** before updating

### After Updating

1. **Check logs** on first launch
2. **Verify data** - open a few trades to confirm
3. **Test features** - create a test trade

## Getting Help

If recovery steps don't work:

### 1. Gather Information

- [ ] Error messages from logs
- [ ] Database file size
- [ ] Number of trades in database
- [ ] Operating system and version
- [ ] App version (old and new)

### 2. Check Existing Issues

Search for similar issues:
- https://github.com/yourusername/trading-journal/issues

### 3. Report Issue

Create a new issue with:
- Error messages (from logs)
- Steps you've tried
- Database statistics (size, trade count)
- OS and app versions

**DO NOT** share your database file publicly (contains trading data)

### 4. Emergency Contact

For urgent data recovery:
- Email: support@trading-journal.app
- Include: Issue description, error logs, OS version

## Advanced Recovery

### Restore from Older Backup

If the most recent backup has issues:

```bash
# 1. List all backups
ls -lth ~/Library/Application\ Support/com.trading-journal.app/backups/

# 2. Try each backup from newest to oldest
cp backups/pre_migration_v4_1738500000.db trading_journal.db

# 3. Start app and test
```

### Merge Multiple Backups

If you need data from multiple backups:

1. Use DB Browser for SQLite
2. Open newest backup
3. Attach older backup as secondary database
4. Use SQL to merge specific data
5. Export merged database

Example SQL:
```sql
-- Attach second database
ATTACH DATABASE 'path/to/older_backup.db' AS old;

-- Copy missing trades
INSERT INTO trades
SELECT * FROM old.trades
WHERE id NOT IN (SELECT id FROM trades);

-- Detach
DETACH DATABASE old;
```

### Reset to Fresh Installation

If all else fails and you're okay losing data:

```bash
# Backup current database (just in case)
mv ~/Library/Application\ Support/com.trading-journal.app/trading_journal.db ~/Desktop/

# Remove app data
rm -rf ~/Library/Application\ Support/com.trading-journal.app/

# Restart app (will create fresh database)
```

## Understanding Migration Logs

When migrations run, you'll see logs like:

```
=== Starting database migration check ===
Current schema version: Some(5)
Found 0 pending migrations
✅ Database schema is up to date
Final schema version: 5
=== Migration check complete ===
```

### What Each Line Means

- **Current schema version**: Highest migration currently applied
- **Found X pending migrations**: How many new migrations will be applied
- **Creating backup**: Backup is being created before migrations
- **Applied migration X**: Migration X was successfully applied
- **Migration stopped**: A migration failed (database rolled back)
- **Final schema version**: Version after all migrations complete

### Good Migration Log

```
=== Starting database migration check ===
Current schema version: Some(3)
Found 2 pending migrations
Creating backup: backups/pre_migration_v5_1738617600.db
Backup created successfully (2.4 MB)
Applied migration 4: add_auto_sync_columns in 3ms
Applied migration 5: add_live_mirror_column in 2ms
✅ Applied 2 migrations successfully
Final schema version: 5
=== Migration check complete ===
```

### Failed Migration Log

```
=== Starting database migration check ===
Current schema version: Some(3)
Found 2 pending migrations
Creating backup: backups/pre_migration_v5_1738617600.db
Backup created successfully (2.4 MB)
Applied migration 4: add_auto_sync_columns in 3ms
❌ Migration 5 failed: near "SYNTAX": syntax error
Migration stopped. Database rolled back to before this migration.
Backup available at: backups/pre_migration_v5_1738617600.db
```

**What to do**: Database is safe (rolled back). Use backup if needed. Report the issue.

## FAQ

**Q: Will I lose my data if a migration fails?**
A: No. Migrations use transactions and roll back on failure. Plus, backups are created before migrations.

**Q: How do I know if my backup is good?**
A: The system verifies each backup with SQLite integrity check. If verification fails, you'll see an error.

**Q: Can I prevent migrations from running?**
A: No, but that's for your safety. Migrations ensure your database works with the new app version.

**Q: How long do migrations take?**
A: Usually a few seconds. Large databases (10,000+ trades) might take up to 30 seconds.

**Q: Can I go back to an older version?**
A: Yes, but you'll need to restore a backup taken before the migration (backups include version in filename).

**Q: What if I deleted my backups folder?**
A: Your main database (`trading_journal.db`) should still be intact. A new backup will be created on next migration.

**Q: Can I manually trigger a backup?**
A: Not currently, but backups are automatic before each migration batch. You can manually copy the database file.

## Prevention is Best

The best recovery is prevention:

1. ✅ Keep the app updated
2. ✅ Don't manually edit database files
3. ✅ Keep adequate disk space
4. ✅ Close app completely before updating
5. ✅ Check logs after updates
6. ✅ Report issues early

Your trading data is important. The migration system is designed to protect it.
