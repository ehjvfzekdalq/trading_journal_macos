# Trading Journal

A native desktop trading journal application built with Tauri, React, and TypeScript. Track trades, analyze performance, and sync positions from exchanges — all stored locally.

**Current version: v1.1.1**

---

## Platforms

| Platform | Format | Notes |
|----------|--------|-------|
| macOS | `.dmg` | Universal binary (Intel + Apple Silicon) |
| Windows | `.msi` / `.exe` | NSIS and MSI installers |
| Linux | `.AppImage` | Built on Arch Linux, portable |

---

## Features

### Trade Journal
- Create, edit, duplicate, and delete trades
- Full trade lifecycle: planned → active → closed
- Multi-take-profit support with individual tracking
- Execution calculations (portfolio %, R multiple, margin, position size, quantity)
- Soft delete with restore (trades are recoverable)
- Filter and sort by status, pair, exchange, direction

### Dashboard & Analytics
- 7 key performance metrics (win rate, total P&L, average R, best/worst trade, etc.)
- Equity curve chart (cumulative P&L over time)
- Daily P&L bar chart
- Recent trades list

### Exchange Integration (BitGet)
- Manual CSV import with preview
- API credentials management (stored securely in system keychain)
- Automatic sync on configurable intervals
- Sync history log
- Live mirror mode (real-time position monitoring)

### Position Monitor
- View open orders and current positions from connected exchanges
- Unrealized P&L tracking

### Anonymous Mode
- Hide all dollar values with a single toggle
- R multiples, percentages, and ratios remain visible
- Persists across sessions

### Import / Export
- Full JSON backup and restore
- Compatible with backups from older versions of the app

### Settings
- Portfolio configuration (starting capital, default risk %)
- Exchange API credentials
- Privacy settings (anonymous mode)
- Feature flags (Position Monitor, API connections)
- Language selection (English / French)

---

## Installation

Download the latest release for your platform from the [Releases page](../../releases).

### macOS — Gatekeeper

The app is not notarized. On first launch, macOS may block it. To open it:

1. Open **System Settings → Privacy & Security**
2. Scroll down and click **"Open Anyway"** next to the blocked app

Or via terminal:
```bash
xattr -cr /Applications/Trading\ Journal.app
```

### Linux — AppImage

```bash
chmod +x Trading-Journal_*.AppImage
./Trading-Journal_*.AppImage
```

---

## Development

### Prerequisites

- **Node.js 20+** and **npm**
- **Rust** — [rustup.rs](https://rustup.rs/)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Linux only** — system libraries:
  ```bash
  # Arch Linux
  sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg patchelf base-devel

  # Ubuntu/Debian
  sudo apt-get install libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

### Run

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

---

## Project Structure

```
trading-journal-macos/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/               # UI components (shadcn/ui)
│   │   ├── ui/                   # Base components
│   │   ├── charts/               # Trading charts
│   │   └── ...
│   ├── context/                  # React contexts (anonymous mode, etc.)
│   ├── lib/                      # Business logic
│   │   ├── api.ts                # Tauri command wrappers
│   │   ├── calculations.ts       # Trade formulas
│   │   ├── validations.ts        # Input validation
│   │   └── utils.ts              # Utilities
│   ├── pages/                    # Pages
│   │   ├── Dashboard.tsx         # Analytics overview
│   │   ├── Journal.tsx           # Trade list
│   │   ├── TradeNew.tsx          # Create trade
│   │   ├── TradeDetail.tsx       # View/edit trade
│   │   ├── Import.tsx            # BitGet CSV import
│   │   ├── OpenOrders.tsx        # Position monitor
│   │   ├── Calculator.tsx        # Trade calculator
│   │   ├── Settings.tsx          # App settings
│   │   ├── Help.tsx              # Help page
│   │   └── Layout.tsx            # Navigation layout
│   └── i18n/                     # Translations (EN / FR)
│
└── src-tauri/                    # Backend (Rust)
    ├── src/
    │   ├── commands/             # Tauri commands
    │   │   ├── trades.rs         # Trade CRUD + soft delete
    │   │   ├── settings.rs       # Settings
    │   │   ├── import.rs         # CSV import, JSON backup/restore
    │   │   ├── stats.rs          # Dashboard stats, equity curve
    │   │   ├── api_sync.rs       # Exchange API credentials + sync
    │   │   ├── live_mirror.rs    # Live position mirroring
    │   │   ├── open_orders.rs    # Open orders fetching
    │   │   ├── positions.rs      # Position fetching
    │   │   ├── sync_scheduler.rs # Auto-sync scheduler
    │   │   └── debug.rs          # Debug utilities
    │   ├── db/                   # Database layer
    │   │   ├── connection.rs     # SQLite connection
    │   │   ├── migration_runner.rs
    │   │   └── migrations/       # 9 versioned SQL migrations (000–009)
    │   └── models/               # Data models (Trade, Settings, etc.)
    └── Cargo.toml
```

---

## Database

**Location**:
- macOS: `~/Library/Application Support/com.nemesis.trading-journal/trading_journal.db`
- Windows: `%APPDATA%\com.nemesis.trading-journal\trading_journal.db`
- Linux: `~/.local/share/com.nemesis.trading-journal/trading_journal.db`

**Tables**: `trades`, `settings`, `api_credentials`, `api_sync_history`, `schema_migrations`

### Migrations

The app uses an automatic migration system (9 migrations, 000–009):
- Runs on startup, applies pending migrations in order
- Creates a timestamped backup before any schema change
- Keeps the last 5 backups
- Handles duplicate column errors gracefully (safe to re-run)
- Uses named column access throughout — resilient to schema evolution

**Backups**: `~/Library/Application Support/com.nemesis.trading-journal/backups/`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2.x |
| Frontend | React 19 + TypeScript |
| Build tool | Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| i18n | i18next (EN/FR) |
| Backend | Rust |
| Database | SQLite via rusqlite |
| Secrets | System keychain (via Tauri keyring plugin) |

---

## License

Private.
