# Performance

A 500-page book takes Traductio about six hours on an M5 Pro, while Google Translate or DeepL handle a sentence before you finish reading it. This page explains where that gap comes from, why a different kind of model would not close it, and which options actually would.

## Why a book takes hours

A language model writes one token at a time, and every token needs the full set of weights read from memory. TranslateGemma in its Q8 build is 13 GB, and an M5 Pro reads memory at very roughly 300 GB/s, so a single stream cannot go much faster than 20 to 25 tokens a second. The GPU's arithmetic is not the limit. The trip to memory is.

The numbers from a real run line up with that. Ron Chernow's _Titan_ has about 2 million characters, which is roughly 500,000 tokens in and, since Spanish runs about 15% longer, roughly 580,000 tokens out. At four requests in parallel the run averaged about 13 paragraphs a minute, close to 27 tokens a second, which puts the whole book near six hours. Nothing is broken. A laptop simply cannot do much better with this model.

The useful mental model is the roofline model. A workload is either memory-bound or compute-bound depending on how much arithmetic it does per byte it reads. Translating one sentence at a time is heavily memory-bound, and batching is the main fix, because one read of the weights then serves several sentences. That is why `--concurrency 4` costs little more per step than one request and gives roughly three times the throughput.

## Why Google Translate and DeepL are fast

They use transformers too. The transformer itself came out of Google's work on machine translation in 2017. The difference is everything around the model.

1. **Hardware.** A datacenter GPU such as the H100, or one of Google's TPUs, reads memory at about 3 TB/s, around ten times a MacBook, and a single request can be spread across several chips.
2. **Batching across users.** Thousands of people's sentences share every read of the weights. A laptop has one user, so it can never batch at that scale.
3. **Smaller, specialized models.** Classic translation systems use an encoder that reads the source sentence in one parallel pass and a decoder that only produces the translation. Published research systems range from a few hundred million to a few billion parameters. Current production sizes are not public, but they are very likely far smaller per request than a 12B general model, and heavily compressed.
4. **Sentence-level parallelism.** A document is cut into sentences that are translated at the same time on many machines, so the wait you see is the latency of one sentence.

Both companies have moved toward larger models for quality, Google with Gemini-based translation and DeepL with an LLM-based model launched in 2024. They can afford it because of the first two points.

## Would a non-transformer model help?

Mostly not. State-space models such as Mamba and RWKV solve a different problem, the cost of attention over very long inputs. Traductio's segments are a few hundred tokens, where attention is cheap, so a 12B Mamba would still read 12B parameters per token and be just as slow. Older approaches are fast but worse. Statistical systems like Moses and the LSTM networks Google used in 2016 lose clearly on literary prose.

The idea that does attack the real bottleneck is non-autoregressive or diffusion decoding, where a model produces many tokens per pass instead of one, so each read of the weights yields more text. Translation research on this goes back to Mask-Predict in 2019, and diffusion language models such as Gemini Diffusion and Inception's Mercury appeared in 2025. None of them is a practical local option for book translation yet.

## Options, compared

The speedups below are estimates from the memory-bandwidth arithmetic above, not measurements. Prices were list prices in October 2026 and change often.

| Option                                                                 | Speedup           | Cost                                                                            |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Q4 model with 8 parallel requests instead of 4                         | about 2x          | Slight quality loss. Needs `OLLAMA_NUM_PARALLEL=8` and an Ollama restart        |
| TranslateGemma 4B                                                      | about 2.5 to 3x   | Noticeably weaker on literary prose                                             |
| Speculative decoding, with the 4B model drafting and the 12B checking  | about 1.5 to 2x   | Not supported by Ollama, so it means llama.cpp's server or MLX                  |
| Small dedicated models such as NLLB-200 or OPUS-MT through CTranslate2 | 10 to 50x         | Clearly worse quality and weak markup handling, fine for a rough draft          |
| A rented H100 running vLLM, used through `--api`                       | 20x or more       | About $2 to $3 an hour, a book in roughly 15 to 30 minutes, text leaves the Mac |
| DeepL or Google Cloud Translation as a new backend                     | a book in minutes | About $20 to $25 per million characters, so $40 to $50 for _Titan_, not private |

The cloud APIs have one advantage beyond speed. DeepL can translate XML with its tags kept in place, and Google accepts HTML, so italics and endnote markers would survive more reliably than they do through placeholder recovery.

[Decision 0007](adr/0007-stay-local-by-default.md) records why Traductio keeps local TranslateGemma as the default anyway.

## Further reading

- Horace He, [Making Deep Learning Go Brrrr From First Principles](https://horace.io/brrr_intro.html). The clearest explanation of memory-bound versus compute-bound work.
- Samuel Williams, Andrew Waterman and David Patterson, "Roofline: An Insightful Visual Performance Model for Multicore Architectures", Communications of the ACM, 2009.
- Ashish Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762), 2017. The transformer paper, written to solve translation.
- Yaniv Leviathan, Matan Kalman and Yossi Matias, [Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192), 2022.
- Marjan Ghazvininejad et al., [Mask-Predict: Parallel Decoding of Conditional Masked Language Models](https://arxiv.org/abs/1904.09324), 2019. Non-autoregressive translation.
- Albert Gu and Tri Dao, [Mamba: Linear-Time Sequence Modeling with Selective State Spaces](https://arxiv.org/abs/2312.00752), 2023.
- NLLB Team, [No Language Left Behind: Scaling Human-Centered Machine Translation](https://arxiv.org/abs/2207.04672), 2022.
