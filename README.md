# Trading Journal - macOS Native App

A full-featured native macOS trading journal application built with Tauri, React, and TypeScript. This is a completely separate project from the Next.js web version, designed specifically for desktop use.

## 🚀 Current Status: v0.9-alpha (Feature Complete - 95% Complete)

### ✅ Completed

**Backend (Rust/Tauri)** - 16/18 commands
- ✅ SQLite database with full schema + indexes
- ✅ Database connection and initialization
- ✅ Data models (Trade, Settings, DashboardStats, EquityCurvePoint)
- ✅ Tauri commands (16 implemented):
  - `get_settings` - Fetch portfolio settings
  - `update_settings` - Update portfolio settings
  - `get_trades` - List all trades with filtering
  - `get_trade` - Get single trade by ID
  - `create_trade` - Create new trade
  - `update_trade` - Update existing trade ✨ NEW
  - `delete_trade` - Delete trade
  - `duplicate_trade` - Clone trade
  - `delete_all_trades` - Bulk delete
  - `get_dashboard_stats` - Rich analytics
  - `get_equity_curve` - Time-series P&L data
  - `preview_bitget_import` - Preview CSV import ✨ NEW
  - `import_bitget_csv` - Import BitGet trades ✨ NEW
  - `delete_bitget_trades` - Delete imported trades ✨ NEW
  - `export_all_data` - JSON backup ✨ NEW
  - `import_all_data` - JSON restore ✨ NEW

**Frontend (React)** - 7/7 pages (All Complete!)
- ✅ React Router setup with navigation
- ✅ i18next for EN/FR translations
- ✅ Type-safe API wrapper for all Tauri commands
- ✅ Layout with sidebar navigation
- ✅ Dashboard page (7 stat cards, equity curve chart, daily P&L chart, recent trades)
- ✅ Journal page (trade list with view/delete buttons)
- ✅ New Trade page (full creation form, multi-TP support)
- ✅ Trade Detail page (view/edit, execution tracking, P&L calculation)
- ✅ Import page (BitGet CSV import with preview) ✨ NEW
- ✅ Settings page (portfolio configuration + backup/restore) ✨ ENHANCED
- ✅ Calculator page (full implementation, copy-to-clipboard)
- ✅ All UI components copied from Next.js
- ✅ Business logic (calculations.ts, validations.ts, utils.ts)
- ✅ Tailwind CSS with dark theme

### 🚧 In Progress / TODO

**Backend Commands to Add** (2 optional)
- [ ] `get_trades_count` - Count filtered trades (for pagination)
- [ ] `send_notification` - Native notifications

**Frontend Enhancements** (Optional)
- [ ] Onboarding dialog for first-time users
- [ ] Date range filter for dashboard/charts
- [ ] Advanced trade filters (status, pair, exchange)
- [ ] Pagination for trade list

**Native macOS Features (Phase 2)**
- [ ] Native menu bar (File, Edit, View, Window, Help)
- [ ] System tray with real-time stats
- [ ] Native notifications
- [ ] Keyboard shortcuts
- [ ] File dialogs for import/export

## 📋 Prerequisites

Before running this project, you need:

1. **Node.js 18+** and **npm**
2. **Rust** (install from https://rustup.rs/)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Tauri CLI**
   ```bash
   npm install -g @tauri-apps/cli@next
   ```

## 🛠️ Development

### Install Dependencies
```bash
npm install
```

### Run Development Mode
```bash
npm run tauri:dev
```

This will:
1. Start the Vite dev server (frontend)
2. Launch the Tauri app with hot-reload

### Build for Production
```bash
npm run tauri:build
```

This creates a `.app` bundle and `.dmg` installer in:
```
src-tauri/target/release/bundle/
```

## 📁 Project Structure

```
trading-journal-macos/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/               # UI components (from Next.js)
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── charts/               # Trading charts
│   │   └── ...
│   ├── lib/                      # Business logic
│   │   ├── api.ts                # Tauri command wrappers
│   │   ├── calculations.ts       # Trade formulas
│   │   ├── validations.ts        # Validation logic
│   │   └── utils.ts              # Utilities
│   ├── pages/                    # React Router pages
│   │   ├── Dashboard.tsx
│   │   ├── Calculator.tsx
│   │   ├── Journal.tsx
│   │   ├── Settings.tsx
│   │   └── Layout.tsx
│   ├── i18n/                     # Internationalization
│   │   ├── config.ts
│   │   └── messages/
│   │       ├── en.json
│   │       └── fr.json
│   ├── App.tsx                   # Main app with routing
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
│
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── commands/             # Tauri commands
│   │   │   ├── trades.rs         # Trade operations
│   │   │   └── settings.rs       # Settings operations
│   │   ├── db/                   # Database layer
│   │   │   ├── connection.rs     # SQLite connection
│   │   │   └── schema.sql        # Database schema
│   │   ├── models/               # Data models
│   │   │   ├── trade.rs
│   │   │   └── settings.rs
│   │   └── lib.rs                # Main Rust entry
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
│
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## 💾 Database

**Location**: `~/Library/Application Support/trading-journal-macos/trading_journal.db`

**Schema**:
- `settings` - Portfolio configuration (singleton)
- `trades` - All trade records with full lifecycle data

The database is automatically created and initialized on first run.

## 🌐 API Layer

All database operations go through Tauri commands defined in `src/lib/api.ts`:

```typescript
import { api } from './lib/api';

// Get settings
const settings = await api.getSettings();

// Get all trades
const trades = await api.getTrades();

// Create trade
const newTrade = await api.createTrade(tradeData);

// Delete trade
await api.deleteTrade(tradeId);
```

## 🎨 Styling

Uses **Tailwind CSS** with the exact same configuration as the Next.js app. All shadcn/ui components are copied and styled identically.

## 🌍 Internationalization

Supports **English** and **French** via i18next. Language selection persists in localStorage.

## 🔧 Tech Stack

- **Tauri 2.x** - Desktop app framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router v6** - Routing
- **i18next** - i18n
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Recharts** - Charts
- **Rust** - Backend language
- **SQLite** - Database (via rusqlite)

## 🚀 Next Steps

1. **Complete remaining Tauri commands** (update_trade, duplicate_trade, stats, import/export)
2. **Finish Calculator page** (copy from Next.js and adapt)
3. **Add Trade detail/edit pages**
4. **Implement charts** (cumulative P&L, daily P&L)
5. **Add native macOS features** (menu bar, system tray, notifications)

## 📝 Notes

- This is **version 1.0.0** - separate versioning from the web app
- Database starts fresh (no automatic migration from web version)
- Users can export from web → import to desktop via JSON backup/restore (once implemented)
- All frontend code is reusable from the Next.js version with minimal changes

## 🐛 Known Issues / Future Enhancements

**Core Features:** All core functionality is working!

**Nice-to-Have Features:**
- Native menu bar (File, Edit, View, Window, Help menus)
- System tray with live stats
- Native macOS notifications for trade milestones
- Pagination for large trade lists
- Date range filters for analytics

## 📄 License

Same as the Next.js version.
