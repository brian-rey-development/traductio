import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptPromptToModel, cleanCompletion, reviewPrompt, translationPrompt } from '../src/translate/prompts.ts';

const EN_ES = { from: 'en', to: 'es' };

describe('translationPrompt', () => {
  it('keeps the trained TranslateGemma shape with the text after a blank gap', () => {
    const prompt = translationPrompt('Hello world.', EN_ES);
    assert.ok(prompt.startsWith('You are a professional English (en) to Spanish (es) translator.'), prompt);
    assert.ok(prompt.endsWith('\n\n\nHello world.'), prompt);
  });
});

describe('reviewPrompt', () => {
  it('shows original and draft and only lists glossary terms present in the source', () => {
    const prompt = reviewPrompt('Back to the Shire at dawn.', 'De vuelta al Shire.', EN_ES, {
      Shire: 'Comarca',
      Mordor: 'Mordor',
    });
    assert.ok(prompt.includes('ORIGINAL (English):\nBack to the Shire at dawn.'), prompt);
    assert.ok(prompt.includes('DRAFT (Spanish):\nDe vuelta al Shire.'), prompt);
    assert.ok(prompt.includes('- Shire => Comarca'), prompt);
    assert.ok(!prompt.includes('Mordor'), prompt);
    assert.ok(prompt.includes('Keep every numbered tag'), prompt);
  });

  it('omits the glossary section entirely when no term matches', () => {
    const prompt = reviewPrompt('A quiet morning.', 'Una mañana tranquila.', EN_ES, { Shire: 'Comarca' });
    assert.ok(!prompt.includes('Use these fixed translations for terms:'), prompt);
  });

  it('does not match a glossary term buried inside a longer word', () => {
    const prompt = reviewPrompt('The Shirelings sang.', 'Cantaban.', EN_ES, { Shire: 'Comarca' });
    assert.ok(!prompt.includes('- Shire => Comarca'), prompt);
  });
});

describe('model prompt adaptation', () => {
  it('appends the no-think switch only for qwen3 models', () => {
    assert.equal(adaptPromptToModel('qwen3:8b', 'prompt'), 'prompt\n/no_think');
    assert.equal(adaptPromptToModel('translategemma:12b-it-q8_0', 'prompt'), 'prompt');
  });

  it('strips think blocks and surrounding whitespace from completions', () => {
    assert.equal(cleanCompletion('<think>reasoning\nmore</think>  Hola. '), 'Hola.');
    assert.equal(cleanCompletion('  Hola. '), 'Hola.');
  });
});
