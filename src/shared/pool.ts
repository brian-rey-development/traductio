// Lanes pull from one shared iterator, so every item is processed exactly once, and the first error stops all lanes.
export const runPool = async <T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  const queue = items.values();
  let stopped = false;
  const lane = async (): Promise<void> => {
    for (const item of queue) {
      if (stopped) return;
      try {
        await worker(item);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
};
