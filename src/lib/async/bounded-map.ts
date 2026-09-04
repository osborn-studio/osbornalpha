export async function boundedMap<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  const workers = Math.min(values.length, Math.max(1, Math.floor(concurrency)));
  let cursor = 0;

  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(values[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  return results;
}
