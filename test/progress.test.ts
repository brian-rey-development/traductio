import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProgress } from '../src/translate/progress.ts';

const capture = (run: () => void): string => {
  const original = process.stderr.write.bind(process.stderr);
  let output = '';
  process.stderr.write = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  try {
    run();
  } finally {
    process.stderr.write = original;
  }
  return output;
};

describe('createProgress', () => {
  it('reports an unknown pace without printing NaN and finishes at a zero ETA', () => {
    const output = capture(() => {
      const progress = createProgress('Translating', 200, () => 0);
      for (let tick = 0; tick < 200; tick += 1) progress.tick();
      progress.done();
    });
    assert.ok(!output.includes('NaN'), output);
    assert.ok(output.includes('Translating 100/200 (50.0%) 0.00 requests/s, ETA --'), output);
    assert.ok(output.includes('Translating 200/200 (100.0%) 0.00 requests/s, ETA 0m00s'), output);
  });
});
