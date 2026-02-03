# GitHub Actions Builds

## Build Matrix

Our release workflow builds for multiple platforms and distributions:

### macOS
- **Runner**: `macos-latest`
- **Target**: Universal Binary (Intel + Apple Silicon)
- **Output**: `.dmg` installer

### Windows
- **Runner**: `windows-latest`
- **Outputs**:
  - `.msi` installer
  - `.exe` NSIS installer

### Linux - Ubuntu
- **Runner**: `ubuntu-latest` (Ubuntu 22.04)
- **Outputs**:
  - `.deb` package (Debian/Ubuntu)
  - `.AppImage` (portable, labeled `-ubuntu`)

### Linux - Arch
- **Runner**: `ubuntu-latest` with `archlinux:latest` container
- **Output**: `.AppImage` labeled `-arch`
- **Why**: Native Arch build for Manjaro/Arch users
- **Includes**: Latest bleeding-edge Arch libraries

## Why Two Linux Builds?

Different Linux distributions have different library versions:

| Distribution | Base | WebKitGTK | Best Build |
|-------------|------|-----------|------------|
| Ubuntu/Debian | Stable | 2.40.x | Ubuntu build |
| Manjaro/Arch | Rolling | 2.44.x+ | Arch build |
| Fedora | Recent | 2.42.x | Ubuntu build (usually works) |

**The Problem**: A binary built on Ubuntu 22.04 may not work on Manjaro because:
- Different GLIBC versions
- Different WebKitGTK versions
- Different GTK versions

**The Solution**: Build specifically for Arch Linux users.

## File Naming

Release files follow this pattern:

```
Trading Journal_1.1.1_amd64-ubuntu.AppImage  ← For Ubuntu/Debian
Trading Journal_1.1.1_amd64-arch.AppImage    ← For Arch/Manjaro
Trading Journal_1.1.1_amd64.deb              ← For Ubuntu/Debian
```

## For Users

### Ubuntu/Debian/Mint
Download: `.deb` or `-ubuntu.AppImage`

### Arch/Manjaro/EndeavourOS
Download: `-arch.AppImage`

### Fedora/openSUSE/Other
Try: `-ubuntu.AppImage` first
If issues: Build from source or use Flatpak

## Testing Builds

### Trigger a release build:
```bash
git tag v1.1.2
git push origin v1.1.2
```

### Or manually:
Go to Actions → Release Builds → Run workflow

## Build Times

Typical build times on GitHub Actions:
- macOS: ~8 minutes
- Windows: ~5 minutes
- Linux Ubuntu: ~6 minutes
- Linux Arch: ~10 minutes (needs to pull Arch image)

Total: ~30 minutes for all platforms
