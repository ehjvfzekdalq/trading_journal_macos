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

    -- Calculated values
    position_type TEXT NOT NULL CHECK(position_type IN ('LONG', 'SHORT')),
    one_r REAL NOT NULL,
    margin REAL NOT NULL,
    position_size REAL NOT NULL,
    quantity REAL NOT NULL,
    planned_weighted_rr REAL NOT NULL,

    -- Execution data
    effective_pe REAL,
    close_date INTEGER,
    exits TEXT,  -- JSON array

    -- Results
    effective_weighted_rr REAL,
    total_pnl REAL,
    pnl_in_r REAL,

    -- Notes
    notes TEXT DEFAULT '',

    -- Import tracking
    import_fingerprint TEXT,

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

-- Initialize default settings
INSERT OR IGNORE INTO settings (id, initial_capital, current_r_percent, default_min_rr, default_leverage, currency, created_at, updated_at)
VALUES (1, 10000.0, 0.02, 2.0, 10, 'USD', strftime('%s', 'now'), strftime('%s', 'now'));
