#!/bin/sh
# Installs Ollama as a tuned LaunchAgent, pulls the models and links the rosetta command.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Model defaults mirror src/shared/defaults.ts.
TRANSLATOR="${ROSETTA_MODEL:-translategemma:12b-it-q8_0}"
REVIEWER="${ROSETTA_REVIEW_MODEL:-qwen3:8b}"
LABEL="com.rosetta.ollama"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/rosetta-ollama.log"
BIN_DIR="$HOME/.local/bin"

step() { printf '\n==> %s\n' "$1"; }

step "Checking prerequisites"
command -v brew >/dev/null || { echo "Homebrew is required: https://brew.sh"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required: brew install pnpm"; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' \
  || { echo "Node 24 or newer is required"; exit 1; }

step "Installing Ollama"
command -v ollama >/dev/null || brew install ollama
OLLAMA_BIN="$(command -v ollama)"
brew services stop ollama >/dev/null 2>&1 || true

# Four parallel slots batch decoding on the GPU, which is where most of the speed comes from.
# One loaded model at a time keeps translator and reviewer from fighting over 24 GB.
step "Configuring the Ollama service ($PLIST)"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$OLLAMA_BIN</string><string>serve</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OLLAMA_NUM_PARALLEL</key><string>4</string>
    <key>OLLAMA_MAX_LOADED_MODELS</key><string>1</string>
    <key>OLLAMA_CONTEXT_LENGTH</key><string>4096</string>
    <key>OLLAMA_FLASH_ATTENTION</key><string>1</string>
    <key>OLLAMA_KV_CACHE_TYPE</key><string>q8_0</string>
    <key>OLLAMA_KEEP_ALIVE</key><string>30m</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
while launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; do sleep 0.2; done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

step "Waiting for Ollama"
for _ in $(seq 1 30); do
  curl -sf http://127.0.0.1:11434/api/version >/dev/null && break
  sleep 1
done
curl -sf http://127.0.0.1:11434/api/version || { echo "Ollama did not start, see $LOG"; exit 1; }

step "Pulling models"
ollama pull "$TRANSLATOR"
ollama pull "$REVIEWER"

step "Installing rosetta"
(cd "$ROOT" && pnpm install --frozen-lockfile)
mkdir -p "$BIN_DIR"
ln -sf "$ROOT/bin/rosetta" "$BIN_DIR/rosetta"

step "Verifying"
"$ROOT/bin/rosetta" doctor
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to your PATH to run rosetta from anywhere." ;;
esac
printf "\nReady. Try: rosetta translate book.epub --to es --limit 30\n"
