# 3. Apply the glossary in the review pass only

- Status: accepted
- Date: 2026-10-12

## Context

Readers notice when a name is translated three different ways across a novel. The obvious fix is to put a glossary in the prompt, but TranslateGemma is sensitive to its prompt format (see [0001](0001-translategemma.md)), and extra instructions in that prompt tend to hurt its output.

## Decision

Keep the first pass on TranslateGemma's exact format. Offer an optional second pass, `--review`, in which a general model (Qwen3 8B) sees the original, the draft and the glossary, and returns a corrected draft. Accept the revision only when it keeps at least as much formatting as the draft and stays within a sane length of it.

## Consequences

The first pass stays as good as the model allows, and the glossary still gets applied. A reviewed book takes roughly twice as long. The review runs after the whole first pass ends, so the two models never sit in memory together.
