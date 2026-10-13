import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectedLengthRatio, languageName, parseLanguage, scriptDensity } from '../src/translate/languages.ts';

describe('language codes', () => {
  it('resolves display names and accepts known codes', () => {
    assert.equal(languageName('es'), 'Spanish');
    assert.equal(languageName('zh'), 'Chinese');
    assert.equal(parseLanguage('fr'), 'fr');
  });

  it('rejects an unknown code instead of echoing it into prompts', () => {
    assert.throws(() => parseLanguage('xx'), /Unknown language code "xx"/);
  });
});

describe('script density', () => {
  it('scales dense scripts down and defaults alphabetic scripts to one', () => {
    assert.equal(scriptDensity('en'), 1);
    assert.equal(scriptDensity('zh'), 0.3);
    assert.equal(scriptDensity('zh-Hans'), 0.3);
    assert.equal(scriptDensity('ja'), 0.4);
    assert.equal(scriptDensity('ko'), 0.45);
  });

  it('derives the expected length ratio from both sides of the pair', () => {
    assert.equal(expectedLengthRatio({ from: 'en', to: 'es' }), 1);
    assert.equal(expectedLengthRatio({ from: 'en', to: 'zh' }), 0.3);
    assert.equal(expectedLengthRatio({ from: 'zh', to: 'en' }), 1 / 0.3);
  });
});
