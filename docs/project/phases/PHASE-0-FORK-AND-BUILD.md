# Phase 0: Fork and Build

**Duration:** 1-3 days
**Dependencies:** None
**Cortex changes required:** None

## Objective

Clone Microsoft's VS Code source, install build dependencies, rebrand as Sandtable, and produce a working build that launches on Arch Linux.

## Prerequisites

### System Requirements

- **OS:** Arch Linux (primary development environment)
- **Disk space:** At least 10 GB free (VS Code source + node_modules + build output)
- **RAM:** 8 GB minimum (16 GB recommended for compilation)
- **Network:** Required for initial clone and `npm install` (offline operation begins after build)

### Required Packages (Arch Linux)

```bash
# Build essentials
sudo pacman -S git nodejs npm python make gcc

# VS Code specific dependencies
sudo pacman -S libx11 libxkbfile libsecret krb5

# For packaging (optional, needed later for .deb/.rpm builds)
sudo pacman -S fakeroot rpm-tools
```

### Node.js Version

VS Code requires Node.js **v20.x or higher** (x64 or ARM64). Check the `.nvmrc` file in the VS Code repo root for the exact pinned version.

```bash
node --version   # Must show v20.x+
npm --version    # Should come with Node
python --version # Required for node-gyp
gcc --version    # C/C++ compiler
```

**Recommended:** Use `fnm` (Fast Node Manager) to manage Node versions:

```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# After cloning, use the project's pinned version
cd /home/mage/repos/MAGEIDE
fnm use
```

## Step-by-Step Instructions

### Step 0.1: Clone VS Code Source

Clone directly into the Sandtable workspace directory:

```bash
cd /home/mage/repos/MAGEIDE
git clone https://github.com/microsoft/vscode.git .
```

The `.` at the end places files directly in the current directory (not in a `vscode/` subdirectory).

**Important:** The path must NOT contain spaces. `/home/mage/repos/MAGEIDE` is fine.

After cloning, verify:

```bash
git log --oneline -1    # Should show latest VS Code commit
ls product.json         # Should exist at repo root
cat .nvmrc              # Shows the Node version VS Code expects
```

### Step 0.2: Pin to a Release Tag

Rather than tracking the `main` branch (which may have in-progress changes), pin to a stable release:

```bash
# List recent release tags
git tag --sort=-v:refname | head -20

# Checkout a stable release (example -- use the latest stable)
git checkout tags/1.96.0 -b sandtable/main
```

This creates a `sandtable/main` branch based on the release tag. All our changes will be made on this branch.

### Step 0.3: Disable GitHub Actions

Prevent Microsoft's CI workflows from running on our fork:

```bash
# Remove or disable all GitHub Actions
rm -rf .github/workflows/
mkdir -p .github
echo "# GitHub Actions disabled for Sandtable fork" > .github/README.md
```

### Step 0.4: Rebrand via product.json

Edit `product.json` in the repo root. This is the central configuration file for branding.

**Fields to change:**

| Field | Original Value | New Value |
|-------|---------------|-----------|
| `nameShort` | `"Code - OSS"` | `"Sandtable"` |
| `nameLong` | `"Code - OSS"` | `"Sandtable"` |
| `applicationName` | `"code-oss"` | `"sandtable"` |
| `dataFolderName` | `".vscode-oss"` | `".sandtable"` |
| `urlProtocol` | `"code-oss"` | `"sandtable"` |
| `serverApplicationName` | `"code-server-oss"` | `"sandtable-server"` |
| `serverDataFolderName` | `".vscode-server-oss"` | `".sandtable-server"` |
| `tunnelApplicationName` | `"code-tunnel-oss"` | `"sandtable-tunnel"` |
| `linuxIconName` | `"com.visualstudio.code.oss"` | `"com.sandtable.ide"` |
| `reportIssueUrl` | (Microsoft URL) | `"https://github.com/darkhorse-and-bandit/Sandtable/issues"` |

**Fields to remove or clear (telemetry):**

| Field | Action |
|-------|--------|
| `sendASmile` | Remove entirely |
| `documentationUrl` | Update or remove |
| `releaseNotesUrl` | Update or remove |
| `keyboardShortcutsUrlMac` | Keep as-is (still useful) |
| `keyboardShortcutsUrlLinux` | Keep as-is |

**Keep unchanged** (for now):
- `builtInExtensions` -- keep the default extensions
- `extensionAllowedBadgeProviders` -- keep as-is
- `extensionAllowedBadgeProvidersRegex` -- keep as-is

### Step 0.5: Create docs/project Directory

Our project documentation already lives here -- make sure the VS Code build doesn't interfere:

```bash
# Verify docs/project exists from our planning docs
ls docs/project/README.md
```

VS Code's `.gitignore` should not exclude our `docs/` directory. If it does, add an exception.

### Step 0.6: Install Dependencies

```bash
cd /home/mage/repos/MAGEIDE

# Use the correct Node version
fnm use    # or: nvm use (if using nvm)

# Install all dependencies (this takes 10-15 minutes on first run)
npm install
```

**Troubleshooting:**

- If `node-gyp` fails, ensure `python` (not `python3`) is available: `sudo ln -s /usr/bin/python3 /usr/bin/python` (or install `python-is-python3`)
- If native module compilation fails, delete caches and retry:
  ```bash
  rm -rf ~/.node-gyp ~/.cache/node-gyp
  git clean -xfd
  npm install
  ```
- If you get ENOSPC errors, increase inotify watchers:
  ```bash
  echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  ```

### Step 0.7: Build

```bash
# Start the incremental build (watch mode)
npm run watch
```

Wait for the message that includes **"Finished compilation"** -- this indicates the initial build is complete. The watcher continues running in the background for incremental rebuilds.

Alternatively, for a one-time build:

```bash
npm run compile
```

### Step 0.8: Launch Sandtable

```bash
# Launch the development build
./scripts/code.sh
```

**What to verify:**

- [ ] Application window opens
- [ ] Title bar shows "Sandtable" (or "Code - OSS" if product.json changes haven't taken effect -- rebuild may be needed)
- [ ] File editing works (open any file, type, save)
- [ ] Terminal works (open integrated terminal, run a command)
- [ ] Extensions panel works (side panel opens, can search)
- [ ] Git integration works (if in a git repo, shows changes)
- [ ] Settings UI works (File > Preferences > Settings)
- [ ] Command Palette works (Ctrl+Shift+P)

### Step 0.9: Initial Commit

Create the initial commit with our branding changes and project docs:

```bash
git add -A
git commit -m "Initial Sandtable fork: rebrand product.json, add project documentation

- Rebrand all product.json fields from Code-OSS to Sandtable
- Add docs/project/ with full project planning documentation
- Remove GitHub Actions workflows (not needed for fork)
- Pin to VS Code release tag as sandtable/main branch"
```

## Build Verification Checklist

Run through this checklist after every clean build:

- [ ] `npm install` completes without errors
- [ ] `npm run watch` or `npm run compile` succeeds
- [ ] `./scripts/code.sh` launches the application
- [ ] Title bar displays correct product name
- [ ] Can create, edit, and save a file
- [ ] Integrated terminal opens and accepts commands
- [ ] Command Palette (Ctrl+Shift+P) opens
- [ ] Settings UI (Ctrl+,) opens
- [ ] Extensions panel opens (may show "No extensions found" -- that's OK)
- [ ] About dialog shows correct application name (Help > About)

## Useful Development Commands

```bash
# Build and watch (incremental)
npm run watch

# Build once (no watch)
npm run compile

# Launch the app
./scripts/code.sh

# Launch with verbose logging
./scripts/code.sh --verbose

# Run linter
npm run eslint

# Run tests
./scripts/test.sh

# Package for Linux x64 (produces distributable)
npm run gulp vscode-linux-x64

# Clean build artifacts
git clean -xfd
```

## Troubleshooting

### "Not a valid Electron app" error

You need to run `npm run watch` (or `npm run compile`) before launching. The build step compiles TypeScript and prepares the Electron app bundle.

### Build fails with native module errors

```bash
# Clear node-gyp cache
rm -rf ~/.node-gyp ~/.cache/node-gyp

# Clean and reinstall
git clean -xfd
npm install
```

### "ENOSPC: System limit for number of file watchers reached"

VS Code's watch mode monitors many files. Increase the limit:

```bash
echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Product name not showing in title bar

After changing `product.json`, you need a full rebuild:

```bash
# Stop the watcher (Ctrl+C)
# Clean and rebuild
npm run compile
./scripts/code.sh
```

## Definition of Done

Phase 0 is complete when:

1. All prerequisites are installed and verified
2. VS Code source is cloned and pinned to a release tag
3. `product.json` is rebranded with all Sandtable fields
4. The project builds without errors
5. Sandtable launches and all standard features work
6. Project documentation is in place under `docs/project/`
7. Initial commit is made on the `sandtable/main` branch
