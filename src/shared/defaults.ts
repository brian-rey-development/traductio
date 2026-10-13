// concurrency mirrors OLLAMA_NUM_PARALLEL in scripts/setup.sh, since lanes beyond the server's slots only queue.
export const DEFAULTS = {
  apiUrl: 'http://127.0.0.1:11434/v1',
  translator: 'translategemma:12b-it-q8_0',
  reviewer: 'qwen3:8b',
  concurrency: 4,
  sourceLanguage: 'en',
  glossaryFile: 'glossary.json',
  glossaryMinOccurrences: 3,
} as const;
