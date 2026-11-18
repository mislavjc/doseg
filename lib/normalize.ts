/**
 * Diacritic-insensitive lowercase for Croatian substring matching — one
 * implementation so "Zapruđe"/"zaprudje" agree everywhere (homepage search,
 * promjene finder). đ needs the explicit map (no NFD decomposition).
 */
export const norm = (s: string) =>
  s.toLowerCase().replaceAll('đ', "d").normalize("NFD").replaceAll(/[\u0300-\u036F]/g, "")
