#!/usr/bin/env bash

set -euo pipefail

REPO="misaelabanto/commita"
BINARY_NAME="commita"
INSTALL_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[commita]${NC} $*"; }
success() { echo -e "${GREEN}[commita]${NC} $*"; }
warn()    { echo -e "${YELLOW}[commita]${NC} $*"; }
error()   { echo -e "${RED}[commita]${NC} $*" >&2; exit 1; }

# Detect OS
detect_os() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    darwin)  echo "darwin" ;;
    linux)   echo "linux" ;;
    msys*|mingw*|cygwin*) echo "windows" ;;
    *) error "Unsupported OS: $os" ;;
  esac
}

# Detect architecture
detect_arch() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64)   echo "amd64" ;;
    arm64|aarch64)  echo "arm64" ;;
    *) error "Unsupported architecture: $arch" ;;
  esac
}

# Check for required tools
check_deps() {
  for cmd in curl; do
    if ! command -v "$cmd" &>/dev/null; then
      error "'$cmd' is required but not installed."
    fi
  done
}

# Get latest release tag from GitHub API
get_latest_tag() {
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"([^"]+)".*/\1/')

  if [ -z "$tag" ]; then
    error "Failed to fetch the latest release tag. Check your internet connection or visit https://github.com/${REPO}/releases."
  fi

  echo "$tag"
}

main() {
  check_deps

  local os arch
  os=$(detect_os)
  arch=$(detect_arch)

  # Windows is not supported via this script — direct users to releases
  if [ "$os" = "windows" ]; then
    error "Windows is not supported by this install script. Please download the binary manually from: https://github.com/${REPO}/releases"
  fi

  local tag
  tag=$(get_latest_tag)

  local binary_file="${BINARY_NAME}-${os}-${arch}"
  local download_url="https://github.com/${REPO}/releases/download/${tag}/${binary_file}"
  local tmp_file
  tmp_file=$(mktemp)

  info "Detected platform: ${os}/${arch}"
  info "Latest version:    ${tag}"
  info "Downloading ${binary_file}..."

  if ! curl -fsSL --progress-bar "$download_url" -o "$tmp_file"; then
    rm -f "$tmp_file"
    error "Download failed. Please check: ${download_url}"
  fi

  chmod +x "$tmp_file"

  # Install to INSTALL_DIR, using sudo if needed
  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmp_file" "${INSTALL_DIR}/${BINARY_NAME}"
  else
    warn "Installing to ${INSTALL_DIR} requires elevated privileges."
    sudo mv "$tmp_file" "${INSTALL_DIR}/${BINARY_NAME}"
  fi

  success "${BINARY_NAME} ${tag} installed to ${INSTALL_DIR}/${BINARY_NAME}"
  echo ""
  echo "  Get started:  commita --help"
  echo "  Docs:         https://github.com/${REPO}#readme"
  echo ""
}

main "$@"
