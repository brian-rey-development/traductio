# 5. Put dropped endnote markers back by sentence position

- Status: accepted
- Date: 2026-10-13

## Context

Nonfiction marks endnotes with superscript numbers such as `<sup>4</sup>`. On a test chapter of a densely footnoted biography, TranslateGemma dropped these markers in 26 of 80 paragraphs and often started a new paragraph where one had been. The text read fine, but the links to the notes at the back of the book were gone.

## Decision

When a numeric `<sup>` or `<a>` goes missing, count which sentence it closed in the source and put it back after the sentence in the same relative position in the translation. Abbreviations like "Mrs." or "John D." do not count as sentence ends, because the translation usually spells them out.

## Consequences

On the same chapter, flags dropped from 26 to 4 and all 90 note markers came back, each after the right sentence. When the translation merges or splits sentences, the position is scaled and can land one sentence off. The alternative, asking the model to keep the markers, was ruled out by [0001](0001-translategemma.md).
