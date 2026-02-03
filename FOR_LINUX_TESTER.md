# Setup Instructions for Linux Tester (Manjaro)

## ⚠️ IMPORTANT: Install Dependencies FIRST

The blank screen you're seeing is because **system libraries are missing**. You MUST install these before running the app.

---

## Step 1: Install Required System Packages

Copy and paste this command in your terminal:

```bash
sudo pacman -S webkit2gtk-4.1 gtk3 base-devel curl wget openssl appmenu-gtk-module libappindicator-gtk3 librsvg nodejs npm
```

Enter your password when prompted.

### What these packages do:
- **webkit2gtk-4.1** - This renders the app's user interface (without it = blank screen!)
- **gtk3** - Creates the window and native controls
- **base-devel** - Build tools (gcc, make, etc.)
- **nodejs, npm** - JavaScript runtime and package manager

---

## Step 2: Install Rust (if not already installed)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

---

## Step 3: Build the App

Navigate to the project directory and run:

```bash
cd trading-journal-macos
npm install
npm run tauri:build
```

This will take several minutes the first time.

---

## Step 4: Run the App

After building successfully, run:

```bash
./src-tauri/target/release/trading-journal
```

### If you still see a blank screen:

1. **Open Developer Tools** - Press `Ctrl+Shift+I` or `F12`
2. **Check the Console tab** for JavaScript errors
3. **Take a screenshot** of any errors you see

### Try debug mode:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 RUST_LOG=debug ./src-tauri/target/release/trading-journal
```

---

## Step 5: Run the Diagnostic Script (Optional but Helpful)

This will generate a report for the developer:

```bash
cd trading-journal-macos
chmod +x scripts/linux-diagnostic.sh
./scripts/linux-diagnostic.sh
```

Send the generated `trading-journal-diagnostic-*.txt` file back to the developer.

---

## Quick Troubleshooting

### "Package not found" error during pacman install
Update your package database first:
```bash
sudo pacman -Sy
```

### "webkit2gtk-4.1: not found"
Try without the version suffix:
```bash
sudo pacman -S webkit2gtk
```

### Build fails with "javascriptcoregtk-4.1 not found"
This means webkit2gtk wasn't installed correctly. Verify:
```bash
pacman -Qi webkit2gtk
```

### Still blank screen after installing dependencies
1. Make sure you **rebuilt** the app after installing dependencies:
   ```bash
   cd trading-journal-macos
   rm -rf src-tauri/target
   npm run tauri:build
   ```
2. Try with X11 (if you're on Wayland):
   ```bash
   GDK_BACKEND=x11 ./src-tauri/target/release/trading-journal
   ```

---

## What to Send Back to the Developer

If the app still doesn't work after following all steps:

1. **Screenshot of any errors** in the terminal when building
2. **Screenshot of the Developer Console** (press F12 in the app)
3. **The diagnostic file** (`trading-journal-diagnostic-*.txt`)
4. **Description** of what you see (completely blank, loading message, colored screen, etc.)

---

## Why Does This Happen?

Tauri apps are **native desktop applications** that use system libraries to render the UI. Unlike Electron apps which bundle everything, Tauri apps are smaller but require these libraries to be installed on your system.

This is normal for Linux desktop apps - most require you to install dependencies first!
