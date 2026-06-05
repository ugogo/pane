export interface QueryPart<T> {
  data: T;
  error: string;
}

export async function readQueryPart<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<QueryPart<T>> {
  try {
    return { data: await read(), error: '' };
  } catch (e) {
    return { data: fallback, error: String(e) };
  }
}
