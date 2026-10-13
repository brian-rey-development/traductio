# rosetta

Rosetta translates whole EPUB books on your own Mac, for free and offline, with TranslateGemma running in Ollama. It keeps chapter structure, italics, links and footnote anchors, saves every translated paragraph as it goes so an interrupted run resumes where it stopped, and writes a report of paragraphs that look suspicious so you review a short list instead of the whole book.

## Setup

```sh
./scripts/setup.sh
```

The script installs Ollama with Homebrew and runs it as a LaunchAgent tuned for book translation, with four parallel request slots, flash attention, a quantized KV cache and one loaded model at a time. It then pulls `translategemma:12b-it-q8_0` and `qwen3:8b`, installs dependencies with pnpm and links `rosetta` into `~/.local/bin`. Run `rosetta doctor` at any point to check that the server and models are ready.

## Translating a book

```sh
rosetta inspect book.epub                          # size, segments, token estimate and numbered chapters
rosetta translate book.epub --to es --limit 40     # try the first 40 paragraphs
rosetta translate book.epub --to es --chapters 3   # one chapter now, ranges such as 3,5-7 also work
rosetta translate book.epub --to es                # the whole book
rosetta translate book.epub --to es --review       # add an editing pass with qwen3:8b
```

Chapter numbers follow the spine order printed by `rosetta inspect`, and a chapter run still writes the complete book with every other chapter left in the source language while the reader menu is translated in full. Because the run happens on the same file, every translated paragraph lands in the same cache the eventual full run reads, so previewing a chapter costs nothing twice.

The output lands next to the input as `book.es.epub`, with `book.es.report.md` beside it. Stopping with Ctrl-C loses nothing, because every completion is cached in `~/.cache/rosetta/` and re-running the same command skips straight to the first untranslated paragraph. Changing the model or the target language produces different prompts, so those runs are cached separately.

## Glossary

```sh
rosetta glossary book.epub --out glossary.json
rosetta translate book.epub --to es --review --glossary glossary.json
```

The glossary command collects capitalized names and terms that recur mid-sentence and writes them as `"term": "term"`. Edit the right-hand side where a term should be translated, for example `"the Shire": "la Comarca"`, and delete entries that are noise. The glossary is applied during the review pass rather than the first pass, because TranslateGemma was trained on one exact prompt format and extra instructions there tend to hurt its output.

## How it works

Every content file in the spine is parsed as XHTML, together with the navigation document and the NCX table of contents, so chapter titles in the reader's menu come out translated too. Text is cut into segments at block boundaries, which means a paragraph, a heading or a list item is one segment, and text that sits beside a nested block (the "Item" in `<li>Item<ul>...</ul></li>`) becomes its own segment instead of being skipped. Preformatted text, scripts, SVG and MathML are left alone.

Inline elements inside a segment are replaced by numbered placeholders, so `Alice was <em>very</em> tired` is sent as `Alice was <1>very</1> tired`. Models are sloppy with placeholders, so the restore step is deliberately forgiving. Closing tags are matched by nesting order rather than by number, which is safe because XHTML cannot contain overlapping tags. Dropped anchors are put back on the side of the paragraph they came from, and a newline the model wrote in place of a `<br/>` becomes that `<br/>` again. Only a formatting pair the model dropped entirely is lost, and only for that span, which the report records as `markup-lost`. TranslateGemma also likes to end every output with a period, so a period is removed when the source segment did not end with punctuation, which keeps headings clean.

Paragraphs longer than about 2,400 characters are split on sentence boundaries to stay inside TranslateGemma's 2K-token input window, and that limit shrinks for Chinese, Japanese and Korean sources because those scripts pack more tokens into each character.

The optional review pass runs after the whole first pass finishes, so the translator and the reviewer never share memory. The reviewer sees the original and the draft side by side, and its revision is accepted only when it keeps at least as much formatting as the draft and stays within a sane length of it.

Every final translation is checked for empty output, untranslated text and length ratios that suggest an omission or an invented passage, with the expected ratio adjusted for dense scripts. Anything that fails lands in the report, most serious first, with the source and the translation next to each other. Empty or truncated completions are never cached, so a re-run asks the model again.

## Speed

Generation on Apple Silicon is limited by memory bandwidth, so four requests decoded together cost little more per step than one, and `--concurrency 4` (the default) gives roughly three times the throughput of sequential requests. `translategemma:12b-it-q4_K_M` is noticeably faster than the Q8 default at a small cost in quality, selected with `--model`. Rosetta talks to any OpenAI-compatible server through `--api`, so the same command works against LM Studio or `mlx_lm.server` if MLX turns out faster on your machine.

## Development

```sh
pnpm check       # typecheck, lint, format check and tests
pnpm format      # rewrite the tree with Prettier
pnpm test        # unit tests plus end-to-end runs against a fake model server
```

Node 24 runs the TypeScript sources directly, so there is no build step.

## Code layout

The source is organized in layers, and imports only ever point downward into the list below, which keeps the dependency graph acyclic and makes each folder readable on its own.

```text
src/cli/         argument parsing, commands and console output
src/translate/   translation pipeline, prompts, checks, report and progress
src/llm/         OpenAI-compatible client, completion cache and deduplication
src/epub/        EPUB package handling, XHTML documents, segments and markup
src/shared/      defaults, guards and the concurrency pool
```

Formatting is owned by Prettier and the lint gate runs the type-checked rule set, so floating promises, unsafe values from external payloads, functions over 20 lines and files over 250 lines all fail `pnpm check` instead of relying on review to catch them. The console API is only allowed inside `src/cli/` because that layer owns user-facing output, the progress reporter in `src/translate/` writes its status line to stderr, and every other layer reports through return values and thrown errors.
