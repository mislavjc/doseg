export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        // oxlint-disable-next-line no-await-in-loop -- each worker runs one item at a time; the worker count is the concurrency limit
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}
