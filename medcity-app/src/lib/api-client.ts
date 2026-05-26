import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";

export type SearchArticlesSortBy = "relevance" | "date";

export type SearchSuggestionsResponse = {
  suggestions: string[];
};

export type SearchStatsResponse = {
  query: string;
  total: number;
  articleTypeBreakdown: Array<{ type: string; count: number }>;
  yearlyDistribution: Array<{ year: number; count: number }>;
};

export type ArticleSummary = {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  abstract: string;
  articleTypes: string[];
  doi?: string;
  pmcid?: string;
  citationCount?: number;
  fullTextUrl?: string;
};

export type SearchArticlesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  query: string;
  articles: ArticleSummary[];
};

export type ArticleDetail = ArticleSummary & {
  keywords?: string[];
  meshTerms?: string[];
  affiliations?: string[];
  language?: string;
  issn?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  conflictOfInterest?: string;
};

type OrvalLikeQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  "queryKey" | "queryFn"
> & {
  keepPreviousData?: boolean;
};

type OrvalLikeHookOptions<TData> = {
  query?: OrvalLikeQueryOptions<TData>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function applyOrvalQueryOptions<TData>(
  opts: OrvalLikeHookOptions<TData> | undefined,
): Omit<UseQueryOptions<TData, Error, TData, readonly unknown[]>, "queryKey" | "queryFn"> {
  const q = opts?.query ?? {};
  const { keepPreviousData: keepPrev, ...rest } = q;

  return {
    ...(rest as Omit<UseQueryOptions<TData, Error, TData, readonly unknown[]>, "queryKey" | "queryFn">),
    ...(keepPrev ? { placeholderData: keepPreviousData } : null),
  };
}

export function useGetSearchSuggestions(
  params: { query: string },
  options?: OrvalLikeHookOptions<SearchSuggestionsResponse>,
) {
  const query = params.query.trim();
  return useQuery({
    queryKey: ["search-suggestions", query] as const,
    queryFn: () =>
      fetchJson<SearchSuggestionsResponse>(
        `/api/search/suggestions?query=${encodeURIComponent(query)}`,
      ),
    ...applyOrvalQueryOptions(options),
  });
}

export function useGetSearchStats(
  params: { query: string },
  options?: OrvalLikeHookOptions<SearchStatsResponse>,
) {
  const query = params.query.trim();
  return useQuery({
    queryKey: ["search-stats", query] as const,
    queryFn: () =>
      fetchJson<SearchStatsResponse>(`/api/search/stats?query=${encodeURIComponent(query)}`),
    ...applyOrvalQueryOptions(options),
  });
}

export function useSearchArticles(
  params: { query: string; page?: number; limit?: number; sortBy?: SearchArticlesSortBy },
  options?: OrvalLikeHookOptions<SearchArticlesResponse>,
) {
  const query = params.query.trim();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortBy: SearchArticlesSortBy = params.sortBy ?? "relevance";

  const qs = new URLSearchParams({
    query,
    page: String(page),
    limit: String(limit),
    sortBy,
  });

  return useQuery({
    queryKey: ["articles-search", query, page, limit, sortBy] as const,
    queryFn: () => fetchJson<SearchArticlesResponse>(`/api/articles/search?${qs.toString()}`),
    ...applyOrvalQueryOptions(options),
  });
}

export function useGetArticle(
  params: { id: string },
  options?: OrvalLikeHookOptions<ArticleDetail>,
) {
  const id = params.id.trim();
  return useQuery({
    queryKey: ["article", id] as const,
    queryFn: () => fetchJson<ArticleDetail>(`/api/articles/${encodeURIComponent(id)}`),
    ...applyOrvalQueryOptions(options),
  });
}

