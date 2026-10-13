import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { restoreMarkup, toPlainText, type Tag } from '../src/epub/markup.ts';

const tags = new Map<string, Tag>([
  ['1', { name: 'a', open: '<a id="ch1"/>', close: '' }],
  ['2', { name: 'em', open: '<em>', close: '</em>' }],
  ['3', { name: 'br', open: '<br/>', close: '' }],
  ['4', { name: 'b', open: '<b class="x">', close: '</b>' }],
]);
const source = '<1/>A <2>very</2> long<3/> and <4>bold</4> day';

describe('restoreMarkup', () => {
  it('restores every placeholder and escapes text', () => {
    const restored = restoreMarkup('<1/>Un día <2>muy</2> largo<3/> y <4>audaz</4> & raro', source, tags);
    assert.deepEqual(restored, {
      markup: '<a id="ch1"/>Un día <em>muy</em> largo<br/> y <b class="x">audaz</b> &amp; raro',
      lostTags: 0,
    });
  });

  it('closes tags by nesting order when the model renumbers them', () => {
    const { markup } = restoreMarkup('<1/>Un <2>día</4> largo<3/> y <4>audaz</2>', source, tags);
    assert.equal(markup, '<a id="ch1"/>Un <em>día</em> largo<br/> y <b class="x">audaz</b>');
  });

  it('puts dropped empty elements back and turns line breaks into <br/>', () => {
    const { markup } = restoreMarkup('Un <2>día</2> largo\ny <4>audaz</4>', source, tags);
    assert.equal(markup, '<a id="ch1"/>Un <em>día</em> largo<br/>y <b class="x">audaz</b>');
  });

  it('turns Markdown emphasis back into the dropped emphasis tag', () => {
    const { markup, lostTags } = restoreMarkup('<1/>Un día *muy* largo<3/> y <4>audaz</4>', source, tags);
    assert.deepEqual(
      { markup, lostTags },
      { markup: '<a id="ch1"/>Un día <em>muy</em> largo<br/> y <b class="x">audaz</b>', lostTags: 0 },
    );
  });

  it('counts paired tags the model dropped', () => {
    assert.equal(restoreMarkup('<1/>Un día largo<3/> y <4>audaz</4>', source, tags).lostTags, 1);
  });

  it('puts dropped endnote markers back after the sentence they followed', () => {
    const noteTags = new Map<string, Tag>([
      ['1', { name: 'sup', open: '<sup>', close: '</sup>' }],
      ['2', { name: 'em', open: '<em>', close: '</em>' }],
      ['3', { name: 'sup', open: '<sup>', close: '</sup>' }],
    ]);
    const noteSource = 'He was rich.<1> 1 </1>The <2>end</2>.<3> 2</3>';
    assert.deepEqual(restoreMarkup('Era rico.\n\nEl <2>fin</2>.', noteSource, noteTags), {
      markup: 'Era rico.<sup> 1 </sup> El <em>fin</em>.<sup> 2</sup>',
      lostTags: 0,
    });
  });

  it('does not treat abbreviations as sentence ends when placing endnote markers', () => {
    const noteTags = new Map<string, Tag>([['1', { name: 'sup', open: '<sup>', close: '</sup>' }]]);
    const noteSource = 'Dr. Smith met Mrs. Jones. They argued.<1>3</1> Then they left. Done.';
    const translated = 'El doctor Smith conoció a la señora Jones. Discutieron. Luego se fueron. Fin.';
    assert.equal(
      restoreMarkup(translated, noteSource, noteTags).markup,
      'El doctor Smith conoció a la señora Jones. Discutieron.<sup>3</sup> Luego se fueron. Fin.',
    );
  });

  it('ignores unknown and duplicated placeholders', () => {
    const { markup } = restoreMarkup('<1/><9>Un</9> <2>día</2> <2>x</2><3/><4>y</4>', source, tags);
    assert.equal(markup, '<a id="ch1"/>Un <em>día</em> x<br/><b class="x">y</b>');
  });
});

describe('toPlainText', () => {
  it('keeps words apart where empty elements such as <br/> sat', () => {
    assert.equal(toPlainText('line one<1/>line two <2>here</2>'), 'line one line two here');
  });
});
