use rusqlite::{params, Connection, OptionalExtension, Result};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(not(test))]
use log;

// Conditional logging that works in both test and production
#[allow(unused_macros)]
macro_rules! log_info {
    ($($arg:tt)*) => {
        #[cfg(not(test))]
        {
            log::info!($($arg)*);
        }
        #[cfg(test)]
        {
            println!("[INFO] {}", format!($($arg)*));
        }
    };
}

#[allow(unused_macros)]
macro_rules! log_error {
    ($($arg:tt)*) => {
        #[cfg(not(test))]
        {
            log::error!($($arg)*);
        }
        #[cfg(test)]
        {
            eprintln!("[ERROR] {}", format!($($arg)*));
        }
    };
}

#[allow(unused_macros)]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(not(test))]
        {
            log::warn!($($arg)*);
        }
        #[cfg(test)]
        {
            println!("[WARN] {}", format!($($arg)*));
        }
    };
}

#[derive(Debug, Clone)]
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

impl Migration {
    pub fn checksum(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.sql.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub fn new(version: u32, name: &'static str, sql: &'static str) -> Self {
        Self { version, name, sql }
    }
}

pub struct MigrationRunner {
    migrations: Vec<Migration>,
}

impl MigrationRunner {
    pub fn new() -> Self {
        Self {
            migrations: Self::collect_migrations(),
        }
    }

    fn collect_migrations() -> Vec<Migration> {
        vec![
            Migration::new(
                0,
                "bootstrap",
                include_str!("migrations/000_bootstrap.sql"),
            ),
            Migration::new(
                1,
                "initial_schema",
                include_str!("migrations/001_initial_schema.sql"),
            ),
            Migration::new(
                2,
                "add_planned_and_effective_entries",
                include_str!("migrations/002_add_planned_and_effective_entries.sql"),
            ),
            Migration::new(
                3,
                "add_import_source",
                include_str!("migrations/003_add_import_source.sql"),
            ),
            Migration::new(
                4,
                "add_auto_sync_columns",
                include_str!("migrations/004_add_auto_sync_columns.sql"),
            ),
            Migration::new(
                5,
                "add_live_mirror_column",
                include_str!("migrations/005_add_live_mirror_column.sql"),
            ),
            Migration::new(
                6,
                "add_soft_delete",
                include_str!("migrations/006_add_soft_delete.sql"),
            ),
            Migration::new(
                7,
                "add_execution_calculations",
                include_str!("migrations/007_add_execution_calculations.sql"),
            ),
        ]
    }

    pub fn run_pending_migrations(&self, conn: &Connection, db_path: &str) -> Result<usize> {
        // Check if this is a legacy database
        if !self.has_schema_migrations_table(conn)? {
            log_info!("Legacy database detected - bootstrapping migration system");
            self.bootstrap_legacy_schema(conn)?;
        }

        // Get current version
        let current_version = self.get_current_version(conn)?;
        log_info!("Current schema version: {:?}", current_version);

        // Find pending migrations
        let pending: Vec<&Migration> = self
            .migrations
            .iter()
            .filter(|m| match current_version {
                Some(v) => m.version > v,
                None => m.version > 0, // Bootstrap is 0, skip it if we have the table
            })
            .collect();

        if pending.is_empty() {
            return Ok(0);
        }

        log_info!("Found {} pending migrations", pending.len());

        // Determine target version for backup
        let target_version = pending.last().unwrap().version;

        // Create backup before applying migrations
        let backup_path = self.create_backup(db_path, target_version)?;
        log_info!("Backup created: {}", backup_path.display());

        // Apply each migration
        let mut applied = 0;
        for migration in pending {
            match self.apply_migration(conn, migration) {
                Ok(_) => {
                    applied += 1;
                    log_info!("✅ Applied migration {}: {}", migration.version, migration.name);
                }
                Err(e) => {
                    log_error!(
                        "❌ Migration {} failed: {}",
                        migration.version,
                        e
                    );
                    log_error!("Migration stopped. Database rolled back to before this migration.");
                    log_error!("Backup available at: {}", backup_path.display());
                    return Err(e);
                }
            }
        }

        Ok(applied)
    }

    fn apply_migration(&self, conn: &Connection, migration: &Migration) -> Result<()> {
        let start = SystemTime::now();

        // Start transaction
        let tx = conn.unchecked_transaction()?;

        // Execute migration SQL
        tx.execute_batch(migration.sql)?;

        // Record migration
        let now = current_timestamp();
        let execution_time = start
            .elapsed()
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        tx.execute(
            "INSERT INTO schema_migrations (version, name, applied_at, checksum, execution_time_ms, notes)
             VALUES (?, ?, ?, ?, ?, NULL)",
            params![
                migration.version,
                migration.name,
                now,
                migration.checksum(),
                execution_time
            ],
        )?;

        // Commit transaction
        tx.commit()?;

        log_info!(
            "Applied migration {} in {}ms",
            migration.name,
            execution_time
        );

        Ok(())
    }

    pub fn verify_migrations(&self, conn: &Connection) -> Result<()> {
        // Get applied migrations
        let mut stmt = conn.prepare(
            "SELECT version, name, checksum FROM schema_migrations WHERE checksum IS NOT NULL ORDER BY version",
        )?;

        let applied: Vec<(u32, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<_>>>()?;

        // Verify checksums
        for (version, name, stored_checksum) in applied {
            if let Some(migration) = self.migrations.iter().find(|m| m.version == version) {
                let expected_checksum = migration.checksum();
                if stored_checksum != expected_checksum {
                    log_error!(
                        "❌ CHECKSUM MISMATCH for migration {} ({})",
                        version,
                        name
                    );
                    log_error!("Expected: {}", expected_checksum);
                    log_error!("Actual:   {}", stored_checksum);
                    log_error!("");
                    log_error!("This means the migration file was modified after it was applied.");
                    log_error!("This is dangerous and could lead to inconsistent database states.");
                    log_error!("");
                    log_error!("Please restore the original migration file or use a backup.");

                    return Err(rusqlite::Error::InvalidQuery);
                }
            }
        }

        Ok(())
    }

    pub fn get_current_version(&self, conn: &Connection) -> Result<Option<u32>> {
        if !self.has_schema_migrations_table(conn)? {
            return Ok(None);
        }

        let version: Option<u32> = conn
            .query_row(
                "SELECT MAX(version) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .optional()?;

        Ok(version)
    }

    fn create_backup(&self, db_path: &str, target_version: u32) -> Result<PathBuf> {
        // Get backup directory
        let db_path_buf = PathBuf::from(db_path);
        let db_dir = db_path_buf.parent().ok_or_else(|| {
            rusqlite::Error::InvalidPath(db_path_buf.clone())
        })?;

        let backup_dir = db_dir.join("backups");

        // Create backup directory if it doesn't exist
        fs::create_dir_all(&backup_dir).map_err(|e| {
            log_error!("Failed to create backup directory: {}", e);
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some(format!("Failed to create backup directory: {}", e)),
            )
        })?;

        // Generate backup filename
        let timestamp = current_timestamp();
        let backup_name = format!("pre_migration_v{}_{}.db", target_version, timestamp);
        let backup_path = backup_dir.join(&backup_name);

        // Create backup using rusqlite's backup API
        let src = Connection::open(db_path)?;
        let mut dst = Connection::open(&backup_path)?;

        {
            let backup = rusqlite::backup::Backup::new(&src, &mut dst)?;
            backup.run_to_completion(5, std::time::Duration::from_millis(250), None)?;
        } // backup is dropped here, releasing the mutable borrow

        // Verify backup
        let metadata = fs::metadata(&backup_path).map_err(|e| {
            log_error!("Failed to verify backup: {}", e);
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some(format!("Failed to verify backup: {}", e)),
            )
        })?;

        if metadata.len() == 0 {
            log_error!("Backup file is empty");
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some("Backup file is empty".to_string()),
            ));
        }

        // Verify integrity
        let integrity: String = dst.pragma_query_value(None, "integrity_check", |row| row.get(0))?;
        if integrity != "ok" {
            log_error!("Backup integrity check failed: {}", integrity);
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some(format!("Backup integrity check failed: {}", integrity)),
            ));
        }

        log_info!(
            "Backup created successfully: {} ({:.2} MB)",
            backup_path.display(),
            metadata.len() as f64 / 1_048_576.0
        );

        // Clean up old backups (keep last 5)
        self.cleanup_old_backups(&backup_dir)?;

        Ok(backup_path)
    }

    fn cleanup_old_backups(&self, backup_dir: &PathBuf) -> Result<()> {
        let mut backups: Vec<_> = fs::read_dir(backup_dir)
            .map_err(|e| {
                log_warn!("Failed to read backup directory: {}", e);
                rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(1),
                    Some(format!("Failed to read backup directory: {}", e)),
                )
            })?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry.path().extension().and_then(|s| s.to_str()) == Some("db")
                    && entry
                        .file_name()
                        .to_str()
                        .map(|s| s.starts_with("pre_migration_"))
                        .unwrap_or(false)
            })
            .collect();

        // Sort by modification time (oldest first)
        backups.sort_by_key(|entry| {
            entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
        });

        // Keep last 5, delete the rest
        if backups.len() > 5 {
            for entry in backups.iter().take(backups.len() - 5) {
                if let Err(e) = fs::remove_file(entry.path()) {
                    log_warn!("Failed to delete old backup: {}", e);
                }
            }
        }

        Ok(())
    }

    fn has_schema_migrations_table(&self, conn: &Connection) -> Result<bool> {
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
            [],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn has_trades_table(&self, conn: &Connection) -> Result<bool> {
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='trades'",
            [],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn bootstrap_legacy_schema(&self, conn: &Connection) -> Result<()> {
        // Detect which version the legacy schema represents
        let legacy_version = self.detect_legacy_version(conn)?;

        log_info!("Detected legacy schema version: {}", legacy_version);

        // Create schema_migrations table (apply migration 0)
        self.apply_migration(conn, &self.migrations[0])?;

        // Insert retroactive records for migrations 1 through legacy_version
        let now = current_timestamp();
        for version in 1..=legacy_version {
            let migration = &self.migrations[version as usize];
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at, checksum, execution_time_ms, notes)
                 VALUES (?, ?, ?, NULL, 0, 'Legacy migration - detected via introspection')",
                params![version, migration.name, now],
            )?;
            log_info!("Marked legacy migration {} as applied", migration.name);
        }

        // Validate schema integrity
        self.validate_schema_integrity(conn, legacy_version)?;

        log_info!("Legacy schema bootstrap complete");

        Ok(())
    }

    fn detect_legacy_version(&self, conn: &Connection) -> Result<u32> {
        // Check columns in reverse order (newest to oldest)
        if self.column_exists(conn, "trades", "execution_portfolio")? {
            return Ok(7);
        }

        if self.column_exists(conn, "trades", "deleted_at")? {
            return Ok(6);
        }

        if self.column_exists(conn, "api_credentials", "live_mirror_enabled")? {
            return Ok(5);
        }

        if self.column_exists(conn, "api_credentials", "auto_sync_enabled")? {
            return Ok(4);
        }

        if self.column_exists(conn, "trades", "import_source")? {
            return Ok(3);
        }

        if self.column_exists(conn, "trades", "planned_entries")? {
            return Ok(2);
        }

        if self.has_trades_table(conn)? {
            return Ok(1);
        }

        Ok(0) // Fresh database
    }

    fn column_exists(&self, conn: &Connection, table: &str, column: &str) -> Result<bool> {
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?",
            params![table, column],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn validate_schema_integrity(&self, conn: &Connection, _expected_version: u32) -> Result<()> {
        // Run SQLite integrity check
        let integrity: String =
            conn.pragma_query_value(None, "integrity_check", |row| row.get(0))?;
        if integrity != "ok" {
            log_error!("Schema integrity check failed: {}", integrity);
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some(format!("Schema integrity check failed: {}", integrity)),
            ));
        }

        // Verify foreign keys are enabled
        let fk_enabled: i32 = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
        if fk_enabled != 1 {
            log_warn!("Foreign keys are not enabled");
        }

        Ok(())
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_are_sequential() {
        let runner = MigrationRunner::new();
        let migrations = runner.migrations;
        for (i, m) in migrations.iter().enumerate() {
            assert_eq!(
                m.version as usize, i,
                "Migration versions must be sequential"
            );
        }
    }

    #[test]
    fn test_all_migrations_have_valid_sql() {
        let runner = MigrationRunner::new();
        let conn = Connection::open_in_memory().unwrap();

        // Apply migrations sequentially since later migrations depend on earlier ones
        for migration in &runner.migrations {
            conn.execute_batch(migration.sql)
                .unwrap_or_else(|_| panic!("Migration {} has invalid SQL", migration.name));
        }
    }

    #[test]
    fn test_fresh_install() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        let runner = MigrationRunner::new();
        let applied = runner.run_pending_migrations(&conn, ":memory:").unwrap();

        // Should apply all migrations except bootstrap (which detects it's not legacy)
        assert!(applied >= 5, "Should apply at least 5 migrations");

        // Verify schema_migrations table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify all tables exist
        let tables = vec!["settings", "trades", "api_credentials", "api_sync_history"];
        for table in tables {
            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                    params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "Table {} should exist", table);
        }
    }

    #[test]
    fn test_idempotency() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        let runner = MigrationRunner::new();

        // Apply all migrations
        let first_run = runner.run_pending_migrations(&conn, ":memory:").unwrap();
        assert!(first_run > 0);

        // Run migrations again
        let second_run = runner.run_pending_migrations(&conn, ":memory:").unwrap();
        assert_eq!(second_run, 0, "Should not apply any migrations on second run");
    }

    #[test]
    fn test_migration_checksums() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        let runner = MigrationRunner::new();
        runner.run_pending_migrations(&conn, ":memory:").unwrap();

        // Verify checksums are stored
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE checksum IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(count > 0, "Should have checksums stored");

        // Verify checksums match
        assert!(runner.verify_migrations(&conn).is_ok());
    }

    #[test]
    fn test_legacy_database_detection_v5() {
        let conn = Connection::open_in_memory().unwrap();

        // Create schema matching v5 (includes all columns up to live_mirror_enabled)
        conn.execute_batch(include_str!("migrations/001_initial_schema.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/002_add_planned_and_effective_entries.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/003_add_import_source.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/004_add_auto_sync_columns.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/005_add_live_mirror_column.sql")).unwrap();

        let runner = MigrationRunner::new();
        let version = runner.detect_legacy_version(&conn).unwrap();

        assert_eq!(version, 5, "Should detect version 5");
    }

    #[test]
    fn test_legacy_database_detection_v2() {
        let conn = Connection::open_in_memory().unwrap();

        // Create schema matching v2
        conn.execute_batch(include_str!("migrations/001_initial_schema.sql")).unwrap();
        conn.execute_batch(include_str!("migrations/002_add_planned_and_effective_entries.sql")).unwrap();

        let runner = MigrationRunner::new();
        let version = runner.detect_legacy_version(&conn).unwrap();

        assert_eq!(version, 2, "Should detect version 2");
    }

    #[test]
    fn test_failed_migration_rollback() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Apply migrations 0-2
        let runner = MigrationRunner::new();
        conn.execute_batch(runner.migrations[0].sql).unwrap();
        runner.apply_migration(&conn, &runner.migrations[0]).unwrap();
        runner.apply_migration(&conn, &runner.migrations[1]).unwrap();
        runner.apply_migration(&conn, &runner.migrations[2]).unwrap();

        // Try to apply a migration with invalid SQL
        let bad_migration = Migration::new(3, "bad_migration", "INVALID SQL SYNTAX");
        let result = runner.apply_migration(&conn, &bad_migration);

        assert!(result.is_err(), "Should fail on invalid SQL");

        // Verify version is still 2
        let version = runner.get_current_version(&conn).unwrap();
        assert_eq!(version, Some(2), "Version should still be 2 after failed migration");
    }
}
