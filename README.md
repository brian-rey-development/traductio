<p align="center">
  <img src="assets/cover.png" alt="Traductio turns an English EPUB page into a Spanish one with italics and footnotes intact" width="100%">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/license-MIT-2563EB"></a>
  <img alt="Node 24 or newer" src="https://img.shields.io/badge/node-%E2%89%A524-0F172A">
  <img alt="macOS on Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-475569">
  <img alt="Runs on Ollama" src="https://img.shields.io/badge/runs%20on-Ollama-94A3B8">
</p>

Traductio translates whole EPUB books on your own Mac, for free and offline, with Google's TranslateGemma running in Ollama. The output is another EPUB that keeps the chapter structure, the table of contents, italics, links and endnote markers, so it opens in Apple Books or any other reader like the original did. Every translated paragraph is saved as soon as it arrives, which means an interrupted run resumes where it stopped, and the run ends with a short report of paragraphs that look suspicious so you review a dozen passages instead of the whole book.

- **Book in, book out.** Chapters, headings, lists, italics, links, endnote markers and the reader's menu all survive the round trip.
- **Private and free.** Nothing leaves your machine, and there is no API key or per-word bill.
- **Resumable.** Stop with Ctrl-C at any point and the same command picks up at the first untranslated paragraph.
- **Previewable.** Translate one chapter or the first 40 paragraphs before committing a night of GPU time to the rest.
- **Reviewed.** An optional second pass lets a general model edit the draft with your glossary, and a report lists every paragraph that came back empty, untranslated, suspiciously short or long, or missing formatting.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/brian-rey-development/traductio/main/scripts/install.sh | sh
```

That one line sets up everything on a Mac with Apple Silicon, asking for your password only if Homebrew needs to be installed. It clones Traductio into `~/.traductio` and then installs whatever is missing, which covers Homebrew, Node, pnpm and Ollama. Ollama runs as a LaunchAgent tuned for book translation, with four parallel request slots, flash attention, a quantized KV cache and one loaded model at a time. The script then downloads `translategemma:12b-it-q8_0` and `qwen3:8b`, about 18 GB together, and links `traductio` into `~/.local/bin`. Running the same line again updates an existing install, and `traductio doctor` checks at any point that the server and models are ready.

The default translation model takes 13 GB, so 24 GB of memory is comfortable, while `translategemma:12b-it-q4_K_M` at 8 GB fits on a 16 GB machine at a small cost in quality. To install from a clone you already have, run the setup script directly.

```sh
git clone https://github.com/brian-rey-development/traductio.git
cd traductio
./scripts/setup.sh
```

## Quick start

```sh
traductio inspect book.epub                          # size, segments, token estimate and numbered chapters
traductio translate book.epub --to es --limit 40     # try the first 40 paragraphs
traductio translate book.epub --to es --chapters 3   # one chapter, ranges such as 3,5-7 also work
traductio translate book.epub --to es                # the whole book
traductio translate book.epub --to es --review       # add an editing pass with qwen3:8b
```

The translation lands next to the input as `book.es.epub`, with `book.es.report.md` beside it. Every completion is cached in `~/.cache/traductio/`, so stopping with Ctrl-C loses nothing and re-running the same command skips straight to the first untranslated paragraph. Changing the model or the target language changes the prompts, which keeps those runs in separate cache entries.

Chapter numbers follow the spine order printed by `traductio inspect`. A chapter run still writes the complete book, with every other chapter left in the source language and the reader menu translated in full, and because it reads and writes the same cache as a full run, previewing a chapter never costs the same paragraph twice.

## Options

| Option                  | Default                      | Effect                                                      |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- |
| `--to <code>`           | required                     | Target language as an ISO code such as `es`, `fr` or `de`   |
| `--from <code>`         | book metadata, else `en`     | Source language                                             |
| `--out <path>`          | `<book>.<to>.epub`           | Where to write the translated book                          |
| `--model <name>`        | `translategemma:12b-it-q8_0` | Translation model                                           |
| `--review`              | off                          | Second pass where a general model edits the draft           |
| `--review-model <name>` | `qwen3:8b`                   | Model for the review pass                                   |
| `--glossary <file>`     | none                         | JSON of fixed term translations, applied by the review pass |
| `--concurrency <n>`     | `4`                          | Parallel requests sent to the server                        |
| `--limit <n>`           | all                          | Only translate the first `n` segments                       |
| `--chapters <list>`     | all                          | Only translate these chapters, given as `3` or `3,5-7`      |
| `--api <url>`           | `http://127.0.0.1:11434/v1`  | Any OpenAI-compatible server                                |

The model and server defaults can also be set with the `TRADUCTIO_MODEL`, `TRADUCTIO_REVIEW_MODEL` and `TRADUCTIO_API_URL` environment variables, and the setup script reads the two model variables when it pulls models.

## Glossary

```sh
traductio glossary book.epub --out glossary.json
traductio translate book.epub --to es --review --glossary glossary.json
```

The glossary command collects capitalized names and terms that recur mid-sentence and writes them as `"term": "term"`. Edit the right-hand side where a term should be translated, for example `"the Shire": "la Comarca"`, and delete entries that are noise. The glossary is applied during the review pass rather than the first pass, because TranslateGemma was trained on one exact prompt format and extra instructions there tend to hurt its output.

## The review report

Every final translation is checked for empty output, untranslated text and length ratios that suggest an omission or an invented passage, with the expected ratio adjusted for dense scripts such as Chinese and Japanese. Anything that fails lands in the report, most serious first, with the source and the translation next to each other.

```markdown
## 3. OPS/chapter03.xhtml

- **markup-lost**: some inline formatting such as italics or links was dropped

> There was nothing so _very_ remarkable in that; nor did Alice think it so _very_ much out of the way...

> No había nada tan extraordinario en eso, ni a Alicia le pareció tan fuera de lo normal...
```

On an 80-paragraph chapter of a densely footnoted biography, the report flagged four paragraphs, all of them book titles or stressed words where the model replaced italics with quotation marks.

## How it works

Every content file in the spine is parsed as XHTML, together with the navigation document and the NCX table of contents, so chapter titles in the reader's menu come out translated too. Text is cut into segments at block boundaries, which means a paragraph, a heading or a list item is one segment, and text that sits beside a nested block (the "Item" in `<li>Item<ul>...</ul></li>`) becomes its own segment instead of being skipped. Preformatted text, scripts, SVG and MathML are left alone.

Inline elements inside a segment are replaced by numbered placeholders, so `Alice was <em>very</em> tired` is sent as `Alice was <1>very</1> tired`. Models are sloppy with placeholders, so the restore step is deliberately forgiving. Closing tags are matched by nesting order rather than by number, which is safe because XHTML cannot contain overlapping tags. Dropped anchors are put back on the side of the paragraph they came from, and a newline the model wrote in place of a `<br/>` becomes that `<br/>` again.

Endnote markers such as `<sup>4</sup>` get special care, because TranslateGemma tends to drop them and start a new paragraph where they sat. When a marker goes missing, Traductio counts which sentence it closed in the source, skipping abbreviations like "Mrs." or "John D." that the translation usually spells out, and puts it back after the sentence in the same relative place in the translation. Only a formatting pair the model dropped entirely is lost, and only for that span, which the report records as `markup-lost`. TranslateGemma also likes to end every output with a period, so a period is removed when the source segment did not end with punctuation, which keeps headings clean.

Paragraphs longer than about 2,400 characters are split on sentence boundaries to stay inside TranslateGemma's 2K-token input window, and that limit shrinks for Chinese, Japanese and Korean sources because those scripts pack more tokens into each character.

The optional review pass runs after the whole first pass finishes, so the translator and the reviewer never share memory. The reviewer sees the original and the draft side by side, and its revision is accepted only when it keeps at least as much formatting as the draft and stays within a sane length of it. Empty or truncated completions are never cached, so a re-run asks the model again.

## Speed

Generation on Apple Silicon is limited by memory bandwidth, because every generated token streams the full set of model weights through the GPU. Four requests decoded together therefore cost little more per step than one, and `--concurrency 4` (the default) gives roughly three times the throughput of sequential requests. On an M5 Pro with 24 GB, the Q8 model translates about 12 to 15 paragraphs of literary nonfiction a minute, so a 500-page biography of around 4,900 paragraphs is an overnight run of about six hours.

`translategemma:12b-it-q4_K_M` reads 8 GB of weights per token instead of 13 and is about 1.5 times faster at a small cost in quality, selected with `--model`. Traductio talks to any OpenAI-compatible server through `--api`, so the same command works against LM Studio, `mlx_lm.server`, or vLLM on a rented GPU when a book needs to be done in minutes rather than hours.

## Development

```sh
pnpm check       # typecheck, lint, format check and tests
pnpm format      # rewrite the tree with Prettier
pnpm test        # unit tests plus end-to-end runs against a fake model server
```

Node 24 runs the TypeScript sources directly, so there is no build step. The logo, icons and cover in `assets/` are generated by `scripts/brand/generate.py`, which needs `rsvg-convert`, the Inter font and `pip install uharfbuzz fonttools`, so a color or tagline change is one edit and one run away.

The source is organized in layers, and imports only ever point downward into the list below, which keeps the dependency graph acyclic and makes each folder readable on its own.

```text
src/cli/         argument parsing, commands and console output
src/translate/   translation pipeline, prompts, checks, report and progress
src/llm/         OpenAI-compatible client, completion cache and deduplication
src/epub/        EPUB package handling, XHTML documents, segments and markup
src/shared/      defaults, guards and the concurrency pool
```

Formatting is owned by Prettier and the lint gate runs the type-checked rule set, so floating promises, unsafe values from external payloads, functions over 20 lines and files over 250 lines all fail `pnpm check` instead of relying on review to catch them. The console API is only allowed inside `src/cli/` because that layer owns user-facing output, the progress reporter in `src/translate/` writes its status line to stderr, and every other layer reports through return values and thrown errors.

## Responsible use

Traductio is meant for books you own or that are in the public domain, translated for your own reading. A machine translation of a copyrighted book is still a derivative of that book, so sharing or selling one needs the rights holder's permission.

## License

[MIT](LICENSE)
