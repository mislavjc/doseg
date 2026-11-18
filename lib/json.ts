/**
 * The one place untyped JSON gets a static type. Callers name the shape they
 * trust the source to have (our data files, our API routes, OTP, GBFS,
 * Overpass); nothing here validates it.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the caller-chosen result type is what a typed JSON boundary is for
export function parseJson<T>(text: string): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unchecked by design, see above
  return JSON.parse(text) as T
}

export async function responseJson<T>(res: Response): Promise<T> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unchecked by design, see above
  return (await res.json()) as T
}
