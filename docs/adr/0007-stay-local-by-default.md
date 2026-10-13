# 7. Keep translation local by default and accept overnight runs

- Status: accepted
- Date: 2026-10-13

## Context

A 500-page book takes about six hours on an M5 Pro, and the limit is memory bandwidth rather than code (see [performance](../performance.md)). Several ways to go much faster exist. A smaller model such as TranslateGemma 4B or NLLB-200 runs 3 to 50 times faster but translates literary prose noticeably worse. A rented H100 running vLLM finishes a book in under half an hour for a few dollars. DeepL or Google Cloud Translation finish in minutes for about $40 to $50 a book, and DeepL keeps XML tags in place natively.

## Decision

Keep TranslateGemma 12B running locally as the default. Do not add a paid API backend for now. Point users who need speed to `--api`, which already works with vLLM on a rented GPU, and to the Q4 model with more parallel requests.

## Consequences

The book never leaves the Mac, there is no account or per-book bill, and quality stays at what TranslateGemma 12B can do, which is what makes the tool worth using. The price is that a long book is an overnight job, so the product leans on resumable runs and chapter previews ([0004](0004-cache-every-completion.md)) to make that wait bearable. If people ask for speed more than privacy, a DeepL backend is the first thing to revisit, since its native tag handling would also make markup recovery simpler.
