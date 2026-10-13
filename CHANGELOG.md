# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- A performance guide in `docs/performance.md` that explains why local translation takes hours, how Google Translate and DeepL get their speed, and which options would make Traductio faster, with further reading.
- Decision record 0007 on keeping translation local by default.

## [0.1.0] - 2026-10-13

The first public release.

### Added

- `traductio translate` turns a DRM-free EPUB into a translated EPUB with TranslateGemma running in Ollama, keeping chapters, the table of contents, italics, links and endnote markers.
- `--chapters` and `--limit` translate part of a book as a preview, sharing the cache with the full run.
- `--review` adds a second pass in which a general model polishes the draft, with an optional `--glossary` for names and terms.
- A review report that lists only the paragraphs that came back empty, untranslated, too short, too long or missing formatting.
- `traductio inspect`, `traductio glossary` and `traductio doctor`.
- A Mac app that drives the CLI, with drag and drop, a language picker, chapter previews, a progress bar and an Open in Books button.
- A one-line installer that sets up Homebrew, Node, pnpm, Ollama and both models, and an uninstall script.
- Dropped endnote markers are put back after the sentence they belonged to, which cut flagged paragraphs on a footnoted test chapter from 26 to 4.
- Property tests that feed thousands of random broken model answers through the markup restore step.

[0.1.0]: https://github.com/brian-rey-development/traductio/releases/tag/v0.1.0
