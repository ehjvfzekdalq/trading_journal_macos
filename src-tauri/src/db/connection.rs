use rusqlite::{Connection, Result};
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Enable WAL mode for better concurrency (PRAGMA returns results, so we use pragma_update)
        conn.pragma_update(None, "journal_mode", "WAL")?;

        // Execute schema
        let schema = include_str!("schema.sql");
        conn.execute_batch(schema)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}
