# 2. Send numbered placeholders instead of HTML

- Status: accepted
- Date: 2026-10-12

## Context

An EPUB paragraph is XHTML, with italics, links, footnote anchors and line breaks inside the text. Sending the raw HTML to the model wastes tokens on attributes like `class="calibre12"`, and models rewrite, drop or invent attributes, which produces broken files that readers refuse to open.

## Decision

Replace every inline element with a short numbered placeholder before translation, so `Alice was <em>very</em> tired` goes out as `Alice was <1>very</1> tired`. Keep the real tags in a map and put them back afterwards. The restore step trusts nothing the model returns. It matches closing tags by nesting order instead of by number, ignores numbers it never sent, puts back empty elements such as anchors that went missing, and escapes everything else as text.

## Consequences

The model sees short, clean text and the output is always valid XHTML, which property tests check against thousands of random broken answers. A formatting pair the model drops completely cannot be recovered, so that span loses its italics and the report flags it as `markup-lost`.
