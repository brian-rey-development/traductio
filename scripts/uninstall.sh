#!/bin/sh
# Removes what setup.sh created. Pass --models to also delete the downloaded models.
# Ollama and Homebrew stay installed because other tools may rely on them.
set -eu

LABEL="com.traductio.ollama"
DIR="${TRADUCTIO_HOME:-$HOME/.traductio}"
TRANSLATOR="${TRADUCTIO_MODEL:-translategemma:12b-it-q8_0}"
REVIEWER="${TRADUCTIO_REVIEW_MODEL:-qwen3:8b}"

step() { printf '==> %s\n' "$1"; }

if [ "${1:-}" = "--models" ] && command -v ollama >/dev/null; then
  step "Deleting $TRANSLATOR and $REVIEWER"
  ollama rm "$TRANSLATOR" "$REVIEWER" || true
fi

step "Stopping the Ollama service"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/Library/Logs/traductio-ollama.log"

step "Removing the command, cache and $DIR"
rm -f "$HOME/.local/bin/traductio"
rm -rf "$HOME/.cache/traductio"
# Only the installer's own clone is deleted, never a development checkout elsewhere.
[ -d "$DIR/.git" ] && rm -rf "$DIR"

echo "Traductio is uninstalled."
