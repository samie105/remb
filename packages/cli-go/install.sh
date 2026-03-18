#!/bin/sh
# remb installer — downloads the right binary for your platform
# Usage: curl -fsSL https://remb.vercel.app/install.sh | sh

set -e

REPO="richie/remb"
INSTALL_DIR="/usr/local/bin"
BINARY="remb"

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

# Get latest version from GitHub releases
VERSION="${REMB_VERSION:-latest}"
if [ "$VERSION" = "latest" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/')
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

# Install — try without sudo first, fall back to sudo
if [ -w "$INSTALL_DIR" ]; then
  mv "${TMP_DIR}/${BINARY}${EXT}" "${INSTALL_DIR}/${BINARY}${EXT}"
else
  echo "Need sudo to install to ${INSTALL_DIR}"
  sudo mv "${TMP_DIR}/${BINARY}${EXT}" "${INSTALL_DIR}/${BINARY}${EXT}"
fi

rm -rf "$TMP_DIR"

echo ""
echo "✔ remb v${VERSION} installed to ${INSTALL_DIR}/${BINARY}${EXT}"
echo ""
echo "Get started:"
echo "  remb login      # Authenticate"
echo "  remb init       # Initialize a project"
echo "  remb --help     # See all commands"
