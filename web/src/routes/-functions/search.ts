/** Preserve Next's single-value versus repeated-key search parameter semantics. */
export function searchRecord(searchStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null)
  for (const [key, value] of new URLSearchParams(searchStr)) {
    const previous = result[key]
    if (previous === undefined) result[key] = value
    else if (Array.isArray(previous)) previous.push(value)
    else result[key] = [previous, value]
  }
  return result
}

/** Router serializer pair: keep raw query strings; the default JSON coercion turns `?q=1e3` into `1000`. */
export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item != null) params.append(key, String(item))
  }
  const query = params.toString()
  return query && `?${query}`
}
