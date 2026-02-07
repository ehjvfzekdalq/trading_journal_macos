-- Settings table (singleton - only one row with id=1)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    initial_capital REAL NOT NULL DEFAULT 10000.0,
    current_r_percent REAL NOT NULL DEFAULT 0.02,
    default_min_rr REAL NOT NULL DEFAULT 2.0,
    default_leverage INTEGER NOT NULL DEFAULT 10,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    exchange TEXT NOT NULL,
    analysis_date INTEGER NOT NULL,
    trade_date INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'WIN', 'LOSS', 'BE')),

    -- Portfolio snapshot
    portfolio_value REAL NOT NULL,
    r_percent REAL NOT NULL,
    min_rr REAL NOT NULL,

    -- Planned setup
    planned_pe REAL NOT NULL,
    planned_sl REAL NOT NULL,
    leverage INTEGER NOT NULL,
    planned_tps TEXT NOT NULL,  -- JSON array
    planned_entries TEXT,  -- JSON array of {price, percent}

    -- Calculated values
    position_type TEXT NOT NULL CHECK(position_type IN ('LONG', 'SHORT')),
    one_r REAL NOT NULL,
    margin REAL NOT NULL,
    position_size REAL NOT NULL,
    quantity REAL NOT NULL,
    planned_weighted_rr REAL NOT NULL,

    -- Execution data
    effective_pe REAL,
    effective_entries TEXT,  -- JSON array of {price, percent}
    close_date INTEGER,
    exits TEXT,  -- JSON array

    -- Results
    effective_weighted_rr REAL,
    total_pnl REAL,
    pnl_in_r REAL,

    -- Notes
    notes TEXT DEFAULT '',

    -- Execution calculations (optional R redefinition)
    execution_portfolio REAL,
    execution_r_percent REAL,
    execution_margin REAL,
    execution_position_size REAL,
    execution_quantity REAL,
    execution_one_r REAL,
    execution_potential_profit REAL,

    -- Import tracking
    import_fingerprint TEXT,
    import_source TEXT NOT NULL DEFAULT 'USER_CREATED' CHECK(import_source IN ('USER_CREATED', 'API_IMPORT', 'CSV_IMPORT', 'LIVE_MIRROR')),

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);
CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades(exchange);
CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_close_date ON trades(close_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_import_fingerprint ON trades(import_fingerprint);
CREATE INDEX IF NOT EXISTS idx_trades_composite ON trades(status, trade_date DESC);

-- API Credentials table (encrypted storage)
CREATE TABLE IF NOT EXISTS api_credentials (
    id TEXT PRIMARY KEY,
    exchange TEXT NOT NULL,
    label TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    passphrase TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_sync_timestamp INTEGER,
    auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
    auto_sync_interval INTEGER NOT NULL DEFAULT 3600,
    live_mirror_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_exchange ON api_credentials(exchange);
CREATE INDEX IF NOT EXISTS idx_credentials_active ON api_credentials(is_active);

-- API Sync History table
CREATE TABLE IF NOT EXISTS api_sync_history (
    id TEXT PRIMARY KEY,
    credential_id TEXT NOT NULL,
    exchange TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    last_sync_timestamp INTEGER NOT NULL,
    trades_imported INTEGER NOT NULL,
    trades_duplicated INTEGER NOT NULL,
    last_trade_id TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (credential_id) REFERENCES api_credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_history_credential ON api_sync_history(credential_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON api_sync_history(status);

-- Initialize default settings
INSERT OR IGNORE INTO settings (id, initial_capital, current_r_percent, default_min_rr, default_leverage, currency, created_at, updated_at)
VALUES (1, 10000.0, 0.02, 2.0, 10, 'USD', strftime('%s', 'now'), strftime('%s', 'now'));
