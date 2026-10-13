# 1. Use TranslateGemma for the first pass

- Status: accepted
- Date: 2026-10-12

## Context

A book has thousands of paragraphs, so the model runs for hours on a laptop. It has to fit in 24 GB next to the operating system, be fast enough to finish overnight and translate well enough that a reader forgets it was a machine. General chat models such as Qwen3 8B follow instructions well but drift on long literary text, and they tend to add comments like "Here is the translation".

## Decision

Use Google's TranslateGemma 12B, a Gemma model fine-tuned only for translation, in its Q8 build through Ollama. Send it exactly the prompt format it was trained on, with nothing added.

## Consequences

Translations read naturally and the model never chats back. The price is that the prompt cannot carry extra instructions, because the model was trained on one format and quality drops when that format changes. Anything beyond plain translation, such as a glossary or style notes, has to happen somewhere else (see [0003](0003-glossary-in-review.md)). The Q8 build needs 13 GB, so 16 GB Macs need the Q4 build.
