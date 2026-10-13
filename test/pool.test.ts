import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runPool } from '../src/shared/pool.ts';

const DELAY_MS = 5;
const delay = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

describe('runPool', () => {
  it('processes every item exactly once within the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay();
      active -= 1;
      seen.push(item);
    });
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(maxActive, 2);
  });

  it('resolves immediately for no items and never calls the worker', async () => {
    let calls = 0;
    await runPool([], 4, () => {
      calls += 1;
      return Promise.resolve();
    });
    assert.equal(calls, 0);
  });

  it('stops starting new work after the first failure and rejects with it', async () => {
    const started: number[] = [];
    await assert.rejects(
      runPool([1, 2, 3, 4, 5], 1, (item) => {
        started.push(item);
        return item === 3 ? Promise.reject(new Error('lane failed')) : Promise.resolve();
      }),
      /lane failed/,
    );
    assert.deepEqual(started, [1, 2, 3]);
  });
});
