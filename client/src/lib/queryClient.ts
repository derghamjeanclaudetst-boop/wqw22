import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // cache: 'no-store' prevents the browser HTTP cache from serving stale
    // data after mutations. TanStack Query's own in-memory cache (staleTime,
    // gcTime) is the source of truth for performance — no need for both.
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Keep data fresh indefinitely — mutations invalidate explicitly
      staleTime: Infinity,
      // Keep unused data in cache for 10 minutes before garbage collecting
      gcTime: 10 * 60 * 1000,
      retry: false,
      // Don't re-fetch on component remount if data exists
      refetchOnMount: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Prefetch a query key immediately (fire-and-forget).
 * Call this on sidebar link hover to warm the cache before navigation.
 * Silently ignores 401 (unauthenticated) and 403 (no permission) responses.
 */
export function prefetch(queryKey: string) {
  queryClient.prefetchQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const res = await fetch(queryKey, { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
  });
}
