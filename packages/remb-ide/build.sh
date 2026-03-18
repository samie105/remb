#!/usr/bin/env bash
# =============================================================================
# Remb IDE — Build Script
#
# Forks microsoft/vscode, injects Remb as a built-in platform contribution
# (not just an extension — runs before any chat is possible), brands it, and
# produces a runnable Electron app.
#
# Usage:
#   ./build.sh [vscode-tag]
#   ./build.sh 1.99.3       # default: latest stable
#
# Requirements:
#   - Node.js 20+, yarn, python3, git
#   - macOS: Xcode command line tools
#   - Linux: build-essential, libsecret-1-dev, libx11-dev, libxkbfile-dev
# =============================================================================
set -euo pipefail

VSCODE_TAG="${1:-1.99.3}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
VSCODE_DIR="$REPO_ROOT/.vscode-source"
EXT_DIR="$REPO_ROOT/../vscode-extension"

log()  { echo -e "\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

# ── 1. Prerequisites check ────────────────────────────────────────────────────
log "Checking prerequisites..."
command -v node >/dev/null 2>&1  || die "node not found. Install Node.js 20+."
command -v yarn >/dev/null 2>&1  || die "yarn not found. Run: npm install -g yarn"
command -v git  >/dev/null 2>&1  || die "git not found."
command -v python3 >/dev/null 2>&1 || die "python3 not found."

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ required (found $NODE_MAJOR). Use nvm or fnm to upgrade."
fi

# ── 2. Clone VS Code ──────────────────────────────────────────────────────────
if [ ! -d "$VSCODE_DIR" ]; then
  log "Cloning VS Code $VSCODE_TAG (shallow)..."
  git clone --depth 1 --branch "$VSCODE_TAG" \
    https://github.com/microsoft/vscode.git "$VSCODE_DIR"
else
  warn "VS Code source already exists at .vscode-source — skipping clone."
  warn "To re-clone: rm -rf .vscode-source && ./build.sh"
fi

# ── 3. Install VS Code dependencies ──────────────────────────────────────────
log "Installing VS Code dependencies (this takes a while)..."
cd "$VSCODE_DIR"
if [ ! -d "node_modules" ]; then
  yarn install
else
  warn "node_modules exists — skipping yarn install. Run 'yarn install' if you hit import errors."
fi

# ── 4. Build the Remb VS Code extension ──────────────────────────────────────
log "Building Remb extension..."
cd "$EXT_DIR"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm run build
else
  yarn install
  yarn build
fi

# ── 5. Copy compiled extension into VS Code built-in extensions ──────────────
log "Installing Remb as a built-in extension..."
BUILTIN_EXT="$VSCODE_DIR/extensions/remb"
mkdir -p "$BUILTIN_EXT"
cp -r "$EXT_DIR/dist/"         "$BUILTIN_EXT/dist/"
cp    "$EXT_DIR/package.json"  "$BUILTIN_EXT/package.json"
cp    "$EXT_DIR/icon.png"      "$BUILTIN_EXT/icon.png"
cp    "$EXT_DIR/LICENSE"       "$BUILTIN_EXT/LICENSE"

# Patch the extension's package.json so VS Code treats it as built-in
node - <<'NODE'
const fs = require('fs');
const p = process.env.BUILTIN_EXT_PKG;
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
// Immediate activation — not onStartupFinished
pkg.activationEvents = ['*'];
// Mark as built-in so it can't be disabled/uninstalled from UI
pkg.isBuiltin = true;
fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
console.log('  patched extension package.json');
NODE
export BUILTIN_EXT_PKG="$BUILTIN_EXT/package.json"
node - <<'NODE'
const fs = require('fs');
const p = process.env.BUILTIN_EXT_PKG;
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.activationEvents = ['*'];
pkg.isBuiltin = true;
fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
console.log('  patched extension package.json');
NODE

# ── 6. Apply Remb platform patches ───────────────────────────────────────────
log "Applying Remb platform patches..."
node "$REPO_ROOT/scripts/apply-remb.js" "$VSCODE_DIR" "$REPO_ROOT"

# ── 7. Compile VS Code (incremental) ─────────────────────────────────────────
log "Compiling VS Code (incremental)..."
cd "$VSCODE_DIR"
yarn compile

log "Build complete!"
echo ""
echo "  Run Remb IDE (macOS):  .vscode-source/scripts/code.sh"
echo "  Run Remb IDE (Linux):  .vscode-source/scripts/code.sh"
echo "  Run Remb IDE (Windows): .vscode-source/scripts/code.bat"
echo ""
echo "  Sign in: Open the Remb panel in the sidebar and click 'Sign In'."
