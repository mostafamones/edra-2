const PAGE_SIZE = 500; // stays below the Data API max_rows cap (1000)

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Reads a collection page by page so results are complete regardless of the API row limit.
 * The caller must supply a stable total order (for example `.order("name").order("id")`).
 */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
