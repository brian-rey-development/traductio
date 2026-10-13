# 4. Cache every completion, keyed by its prompt

- Status: accepted
- Date: 2026-10-12

## Context

A full book takes about six hours. Laptops sleep, people close Terminal, and a crash at paragraph 4,000 should not cost the first 3,999. People also want to preview one chapter before committing a night to the whole book.

## Decision

Append every finished completion to a JSONL file in `~/.cache/traductio/`, one file per book, keyed by a SHA-256 hash of the model name and the exact prompt. Re-running any command looks up each prompt first and only calls the model on a miss. Empty or truncated answers are never stored.

## Consequences

Stopping is free and resuming needs no special command. A chapter preview fills the same cache the full run reads, so no paragraph is ever paid for twice. Because the key is the prompt itself, changing the model or the target language starts fresh automatically, with no invalidation logic. The cost is disk space, a few megabytes per book.
