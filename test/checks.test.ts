import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkTranslation } from '../src/checks.ts';
import { splitLongText } from '../src/chunks.ts';

const SOURCE = 'It is a truth universally acknowledged, that a single man in possession of a good fortune.';
const EN_ES = { from: 'en', to: 'es' };

describe('checkTranslation', () => {
  it('accepts a plausible translation', () => {
    const spanish = 'Es una verdad universalmente reconocida que un hombre soltero, poseedor de una gran fortuna.';
    assert.deepEqual(checkTranslation(SOURCE, spanish, EN_ES), []);
  });

  it('flags empty, untranslated, truncated and padded output', () => {
    assert.deepEqual(checkTranslation(SOURCE, '  ', EN_ES), ['empty']);
    assert.deepEqual(checkTranslation(SOURCE, SOURCE, EN_ES), ['untranslated']);
    assert.deepEqual(checkTranslation(SOURCE, 'Es una verdad.', EN_ES), ['too-short']);
    assert.deepEqual(checkTranslation(SOURCE, SOURCE.repeat(3), EN_ES), ['too-long']);
  });

  it('expects much shorter output for dense scripts', () => {
    assert.deepEqual(checkTranslation(SOURCE, '凡是有钱的单身汉，总想娶位太太，这已经成了一条举世公认的真理。', { from: 'en', to: 'zh' }), []);
  });
});

describe('splitLongText', () => {
  it('keeps short text whole', () => {
    assert.deepEqual(splitLongText('One. Two.', 'en'), ['One. Two.']);
  });

  it('splits long text on sentence boundaries without losing words', () => {
    const text = Array.from({ length: 120 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = splitLongText(text, 'en');
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.endsWith('.')));
    assert.equal(chunks.join(' '), text);
  });
});
