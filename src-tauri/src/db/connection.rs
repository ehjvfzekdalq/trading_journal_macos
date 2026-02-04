use rusqlite::{Connection, Result};
use std::sync::Mutex;
use crate::db::migration_runner::MigrationRunner;
use log;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Enable WAL mode for better concurrency
        conn.pragma_update(None, "journal_mode", "WAL")?;

        // Run new migration system
        let runner = MigrationRunner::new();

        // Log start
        log::info!("=== Starting database migration check ===");

        // Get current version
        let current_version = runner.get_current_version(&conn)?;
        log::info!("Current schema version: {:?}", current_version);

        // Run pending migrations
        let applied = runner.run_pending_migrations(&conn, db_path)?;

        if applied > 0 {
            log::info!("✅ Applied {} migrations successfully", applied);
        } else {
            log::info!("✅ Database schema is up to date");
        }

        // Verify migration integrity (checksums)
        runner.verify_migrations(&conn)?;

        // Final version check
        if let Some(version) = runner.get_current_version(&conn)? {
            log::info!("Final schema version: {}", version);
        }

        log::info!("=== Migration check complete ===");

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}
