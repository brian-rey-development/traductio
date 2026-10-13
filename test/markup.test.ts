import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { restoreMarkup, toPlainText, type Tag } from '../src/markup.ts';

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
    assert.deepEqual({ markup, lostTags }, { markup: '<a id="ch1"/>Un día <em>muy</em> largo<br/> y <b class="x">audaz</b>', lostTags: 0 });
  });

  it('counts paired tags the model dropped', () => {
    assert.equal(restoreMarkup('<1/>Un día largo<3/> y <4>audaz</4>', source, tags).lostTags, 1);
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
