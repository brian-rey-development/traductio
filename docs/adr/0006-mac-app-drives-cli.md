# 6. Let the Mac app drive the CLI instead of reimplementing it

- Status: accepted
- Date: 2026-10-13

## Context

Most readers will not use Terminal, so Traductio needs a Mac app. The translation pipeline is about 1,700 lines of tested TypeScript, and writing it again in Swift would mean two implementations drifting apart.

## Decision

Build a small SwiftUI app that runs the installed `traductio` command and reads its output. The app asks the user's login shell for its PATH, because apps opened from Finder get a bare one without Node or Homebrew. The CLI prints one progress line per paragraph when `TRADUCTIO_PROGRESS_EVERY=1` is set, and the app turns those lines into a progress bar. Stop sends the same signal as Ctrl-C.

## Consequences

Every fix to the pipeline reaches both the app and the CLI at once, and the app stays a few hundred lines. The app depends on the CLI's text output, so changing those messages means updating the parser in `macos/Sources/Traductio/Output.swift`. The app still needs the one-line installer for Node, Ollama and the models, and it says so on first launch.
