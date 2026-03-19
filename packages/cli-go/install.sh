#!/bin/sh
# remb installer — downloads the right binary for your platform
# Usage: curl -fsSL https://www.useremb.com/install.sh | sh

set -e

REPO="samie105/remb"
BINARY="remb"

# Prefer a user-owned directory so no sudo is required.
# Priority: ~/.local/bin → ~/bin → /usr/local/bin (fallback with sudo)
if [ -d "$HOME/.local/bin" ] || ! [ -d "/usr/local/bin" ] || [ -w "/usr/local/bin" ] 2>/dev/null; then
  INSTALL_DIR="$HOME/.local/bin"
elif [ -d "$HOME/bin" ]; then
  INSTALL_DIR="$HOME/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
fi

# Detect OS
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  darwin) OS="darwin" ;;
  linux)  OS="linux" ;;
  mingw*|msys*|cygwin*) OS="windows" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

EXT=""
if [ "$OS" = "windows" ]; then
  EXT=".exe"
fi

# Get latest version from remb API
VERSION="${REMB_VERSION:-latest}"
if [ "$VERSION" = "latest" ]; then
  VERSION=$(curl -fsSL "https://www.useremb.com/api/cli/version" | sed -E 's/.*"version":"?([^",}]+)"?.*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "Error: Could not determine latest version"
  exit 1
fi

FILENAME="${BINARY}-${OS}-${ARCH}${EXT}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${FILENAME}"

echo "Downloading remb v${VERSION} for ${OS}/${ARCH}..."
echo "  ${DOWNLOAD_URL}"

TMP_DIR=$(mktemp -d)
curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/${BINARY}${EXT}"
chmod +x "${TMP_DIR}/${BINARY}${EXT}"

# Ensure the install directory exists
mkdir -p "$INSTALL_DIR"

# Install — no sudo needed for user-owned directory; fall back to sudo for system dirs
if [ -w "$INSTALL_DIR" ]; then
  mv "${TMP_DIR}/${BINARY}${EXT}" "${INSTALL_DIR}/${BINARY}${EXT}"
else
  echo "Need sudo to install to ${INSTALL_DIR}"
  sudo mv "${TMP_DIR}/${BINARY}${EXT}" "${INSTALL_DIR}/${BINARY}${EXT}"
fi

rm -rf "$TMP_DIR"

# Ensure the install dir is on PATH and inform the user
SHELL_RC=""
case "$SHELL" in
  */zsh)  SHELL_RC="$HOME/.zshrc" ;;
  */bash) SHELL_RC="${HOME}/.bashrc" ;;
esac

PATH_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
if [ -n "$SHELL_RC" ] && ! grep -qF "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# Added by remb installer" >> "$SHELL_RC"
  echo "$PATH_LINE" >> "$SHELL_RC"
  echo ""
  echo "NOTE: ${INSTALL_DIR} added to PATH in ${SHELL_RC}"
  echo "      Run: source ${SHELL_RC}   (or open a new terminal)"
fi

echo ""
echo "✔ remb v${VERSION} installed to ${INSTALL_DIR}/${BINARY}${EXT}"
echo ""
echo "Get started:"
echo "  remb login      # Authenticate"
echo "  remb init       # Initialize a project"
echo "  remb --help     # See all commands"
