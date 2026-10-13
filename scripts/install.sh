#!/bin/sh
# One-line installer: curl -fsSL https://raw.githubusercontent.com/brian-rey-development/traductio/main/scripts/install.sh | sh
set -eu

REPO="https://github.com/brian-rey-development/traductio.git"
DIR="${TRADUCTIO_HOME:-$HOME/.traductio}"

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  echo "Finish installing Apple's Command Line Tools in the dialog, then run this installer again."
  exit 1
fi

if [ -d "$DIR/.git" ]; then
  printf '==> Updating %s\n' "$DIR"
  git -C "$DIR" pull --ff-only
else
  printf '==> Cloning Traductio into %s\n' "$DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi

# Reattach stdin to the terminal so Homebrew's installer can ask for a password under curl | sh.
if (: </dev/tty) 2>/dev/null; then
  exec "$DIR/scripts/setup.sh" </dev/tty
fi
exec "$DIR/scripts/setup.sh"
