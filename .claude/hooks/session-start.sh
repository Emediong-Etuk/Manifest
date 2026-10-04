#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: installs the pinned
# toolchain (see docs/DECISIONS.md) and JS dependencies, and restores the
# devnet keypairs from environment secrets when they are configured.
# Idempotent and non-interactive. Only runs in remote (cloud) sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SOLANA_VERSION="4.1.2"
ANCHOR_VERSION="1.2.0"
SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
export PATH="$LOCAL_BIN:$SOLANA_BIN:$HOME/.cargo/bin:$PATH"

# Solana CLI (Agave) + cargo-build-sbf
if ! solana --version 2>/dev/null | grep -q "solana-cli $SOLANA_VERSION"; then
  if command -v agave-install >/dev/null 2>&1; then
    agave-install init "$SOLANA_VERSION" >/dev/null
  else
    sh -c "$(curl -sSfL "https://release.anza.xyz/v$SOLANA_VERSION/install")" >/dev/null
  fi
fi

# Anchor CLI: prebuilt release binary (avm needs a GitHub git clone, which may be blocked)
if ! anchor --version 2>/dev/null | grep -q "anchor-cli $ANCHOR_VERSION"; then
  curl -sSfL -o "$LOCAL_BIN/anchor" \
    "https://github.com/solana-foundation/anchor/releases/download/v$ANCHOR_VERSION/anchor-$ANCHOR_VERSION-x86_64-unknown-linux-gnu"
  chmod +x "$LOCAL_BIN/anchor"
fi

# Host Rust toolchain pinned in rust-toolchain.toml (rustup installs it on demand;
# do it now so the first cargo command is fast).
(cd "$CLAUDE_PROJECT_DIR" && rustup show active-toolchain >/dev/null 2>&1 || rustup toolchain install)

# JS dependencies
(cd "$CLAUDE_PROJECT_DIR" && pnpm install --prefer-offline >/dev/null)

# Devnet keypairs from environment secrets (JSON byte arrays). Never echoed.
mkdir -p "$HOME/.config/solana"
if [ -n "${MANIFEST_DEV_KEYPAIR:-}" ] && [ ! -f "$HOME/.config/solana/manifest-dev.json" ]; then
  (umask 077 && printf '%s' "$MANIFEST_DEV_KEYPAIR" > "$HOME/.config/solana/manifest-dev.json")
fi
if [ -n "${MANIFEST_PROGRAM_KEYPAIR:-}" ] && [ ! -f "$CLAUDE_PROJECT_DIR/target/deploy/manifest-keypair.json" ]; then
  mkdir -p "$CLAUDE_PROJECT_DIR/target/deploy"
  (umask 077 && printf '%s' "$MANIFEST_PROGRAM_KEYPAIR" > "$CLAUDE_PROJECT_DIR/target/deploy/manifest-keypair.json")
fi
if [ -f "$HOME/.config/solana/manifest-dev.json" ]; then
  solana config set --url devnet --keypair "$HOME/.config/solana/manifest-dev.json" >/dev/null
else
  solana config set --url devnet >/dev/null
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$LOCAL_BIN:$SOLANA_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
