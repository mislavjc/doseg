export const args = process.argv.slice(2)

/** The value after `name` on the command line, if one follows it. */
export function argValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
