# Building Trading Journal on Windows

This guide explains how to build Windows installers on a Windows machine (if you have one available).

**Note:** You don't need this if you're using GitHub Actions. This is only for local Windows builds.

---

## Prerequisites

### 1. Install Node.js

Download and install from: https://nodejs.org/

**Verify installation:**
```powershell
node --version
npm --version
```

### 2. Install Rust

Download from: https://rustup.rs/

Or run in PowerShell:
```powershell
# Download and run rustup-init.exe
Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
.\rustup-init.exe
```

**Verify installation:**
```powershell
rustc --version
cargo --version
```

### 3. Install Visual Studio Build Tools

**Option A: Visual Studio Community (Recommended)**
1. Download: https://visualstudio.microsoft.com/downloads/
2. Install with "Desktop development with C++" workload
3. Restart after installation

**Option B: Build Tools Only (Smaller download)**
1. Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
2. Install "C++ build tools" workload
3. Restart after installation

**Verify installation:**
```powershell
# This should find cl.exe (C++ compiler)
where.exe cl
```

---

## Building

### Step 1: Clone Repository

```powershell
# If you have the code locally, navigate to it
cd C:\path\to\trading-journal-macos

# Or clone from GitHub
git clone https://github.com/YOUR_USERNAME/trading-journal-macos.git
cd trading-journal-macos
```

### Step 2: Install Dependencies

```powershell
npm install
```

### Step 3: Build

```powershell
# Build both MSI and NSIS installers
npm run tauri build
```

**Build time:** 10-15 minutes (first build downloads dependencies)

---

## Output

Installers will be created at:

```
src-tauri\target\release\bundle\
├── msi\
│   └── Trading Journal_1.0.0_x64_en-US.msi
└── nsis\
    └── Trading Journal_1.0.0_x64-setup.exe
```

---

## Testing

```powershell
# Open output folder
explorer src-tauri\target\release\bundle\msi\

# Install MSI
# Double-click the .msi file to install
# Launch from Start Menu

# Or install NSIS
explorer src-tauri\target\release\bundle\nsis\
# Double-click the .exe file to install
```

---

## Troubleshooting

### Error: "link.exe not found"

**Cause:** Visual Studio Build Tools not installed or not in PATH

**Solution:**
1. Install Visual Studio Build Tools with C++ workload
2. Restart PowerShell/Command Prompt
3. Try again

### Error: "Command not found: tauri"

**Solution:**
```powershell
npm install -g @tauri-apps/cli@latest
```

### Error: Rust compiler errors

**Solution:**
```powershell
rustup update stable
cargo clean
npm run tauri build
```

### Error: Frontend build fails

**Solution:**
```powershell
Remove-Item -Recurse -Force node_modules, dist
npm install
npm run build
npm run tauri build
```

### Build is very slow

**Possible causes:**
- Antivirus scanning Rust compilation (add cargo target folder to exclusions)
- First build downloads all dependencies (subsequent builds are faster)

**Speed up:**
```powershell
# Add exclusions to Windows Defender (run as Administrator)
Add-MpPreference -ExclusionPath "C:\path\to\trading-journal-macos\src-tauri\target"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.cargo"
```

---

## Clean Build

```powershell
# Remove all build artifacts
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force src-tauri\target\release\bundle
cd src-tauri
cargo clean
cd ..

# Rebuild from scratch
npm install
npm run tauri build
```

---

## Building Only MSI (or only NSIS)

Edit `src-tauri\tauri.conf.json`:

```json
{
  "bundle": {
    "targets": ["msi"]  // or ["nsis"] or both ["msi", "nsis"]
  }
}
```

Then build:
```powershell
npm run tauri build
```

---

## Code Signing (Optional)

If you have a code signing certificate:

### Step 1: Update tauri.conf.json

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERTIFICATE_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

### Step 2: Set Certificate Password

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-cert-password"
```

### Step 3: Build

```powershell
npm run tauri build
```

### Step 4: Verify Signature

```powershell
Get-AuthenticodeSignature "src-tauri\target\release\bundle\msi\Trading Journal_1.0.0_x64_en-US.msi"
```

---

## Build Script for Windows (PowerShell)

Create `scripts\build-release.ps1`:

```powershell
# Trading Journal - Windows Build Script

Write-Host "======================================"
Write-Host "Trading Journal - Windows Build"
Write-Host "======================================"
Write-Host ""

# Get version
$version = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "Building version: $version"
Write-Host ""

# Clean previous builds
Write-Host "Cleaning previous builds..."
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue src-tauri\target\release\bundle
Write-Host "Clean complete"
Write-Host ""

# Install dependencies
Write-Host "Installing dependencies..."
npm install
Write-Host "Dependencies installed"
Write-Host ""

# Build
Write-Host "Building Windows installers..."
npm run tauri build
Write-Host ""

Write-Host "======================================"
Write-Host "Build Artifacts:"
Write-Host "======================================"
Write-Host ""

# Show output
Get-ChildItem -Path src-tauri\target\release\bundle\msi -ErrorAction SilentlyContinue
Get-ChildItem -Path src-tauri\target\release\bundle\nsis -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Test installer on clean Windows machine"
Write-Host "2. Upload to distribution channel"
Write-Host "3. Send to testers with INSTALLATION.md"
Write-Host ""
Write-Host "Build complete!"
```

Run it:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\build-release.ps1
```

---

## Alternative: Use GitHub Actions (Recommended)

Instead of building on Windows locally, use GitHub Actions:

1. Commit and push your code
2. Create version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. GitHub Actions automatically builds Windows installers
4. Download from Actions artifacts

**Advantages:**
- No Windows machine needed
- Consistent build environment
- Automated process
- Builds both macOS and Windows

---

## Summary

**For most users:** Use GitHub Actions (no Windows machine needed)

**For local Windows builds:**
1. Install Node.js, Rust, Visual Studio Build Tools
2. Run `npm run tauri build`
3. Installers in `src-tauri\target\release\bundle\`

**Build time:** 10-15 minutes (first build)

**Output size:** ~10-25 MB installers
