import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { Paginated } from '../types';

interface Options {
  perPage?: number;
  /** Extra query parameters (filters). Changing any of them returns to page 1. */
  params?: Record<string, string | number | undefined | null>;
  /** Wait this long after the last keystroke before searching. */
  debounceMs?: number;
}

/**
 * One page of a server-side list, with search done by the server.
 *
 * Replaces the pattern of fetching a whole table and filtering it in the
 * browser, which either downloaded everything (and eventually froze the tab)
 * or, where the server capped it, silently searched only the first fifty rows.
 * The search box drives a debounced query; out-of-order responses are
 * discarded so a slow page 1 can't overwrite a fast page 2.
 */
export function usePaginatedList<T>(endpoint: string | null, { perPage = 25, params = {}, debounceMs = 300 }: Options = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [result, setResult] = useState<Paginated<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  // A new search or filter starts from the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, paramsKey]);

  const load = useCallback(async () => {
    if (!endpoint) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('per_page', String(perPage));
    if (debouncedSearch) query.set('search', debouncedSearch);
    for (const [key, value] of Object.entries(JSON.parse(paramsKey) as Record<string, unknown>)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }

    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const res = await api.get<Paginated<T>>(`${endpoint}${separator}${query.toString()}`);
      if (id === requestId.current) setResult(res);
    } catch (err: any) {
      if (id === requestId.current) setError(err?.message || 'Could not load this list.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [endpoint, page, perPage, debouncedSearch, paramsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows: result?.data ?? [],
    page,
    setPage,
    totalPages: result?.total_pages ?? 1,
    total: result?.total ?? 0,
    perPage: result?.per_page ?? perPage,
    search,
    setSearch,
    loading,
    /** First load only — later page changes keep the old rows on screen. */
    initialLoading: loading && result === null,
    error,
    reload: load,
    /** The whole response, for endpoints that send extras beside the page (totals by role). */
    raw: result as (Paginated<T> & Record<string, any>) | null,
  };
}
