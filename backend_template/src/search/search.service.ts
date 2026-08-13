import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_TOOL = 'medcity-connect';
const NCBI_EMAIL = 'dev@medcity.local';
const ARTICLE_TYPES = [
  'Review',
  'Clinical Trial',
  'Randomized Controlled Trial',
  'Meta-Analysis',
  'Systematic Review',
  'Case Reports',
  'Observational Study',
];
const COMMON_TERMS = [
  'cancer',
  'diabetes',
  'COVID-19',
  'hypertension',
  'Alzheimer',
  'cardiovascular',
  'obesity',
  'depression',
  'immunotherapy',
  'CRISPR',
  'machine learning',
  'microbiome',
  'inflammation',
  'vaccine',
  'gene therapy',
  'stroke',
  'sepsis',
  'Parkinson',
  'SARS-CoV-2',
  'clinical trial',
];

type ArticleSummary = {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  abstract: string;
  articleTypes: string[];
  doi: string;
  pmcid: string;
  citationCount: number;
  fullTextUrl: string;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class SearchService {
  async suggestions(rawQuery?: string) {
    const query = String(rawQuery || '').trim();
    if (!query) throw new BadRequestException('Missing query');

    const localSuggestions = COMMON_TERMS.filter((term) =>
      term.toLowerCase().startsWith(query.toLowerCase()),
    ).slice(0, 5);
    if (localSuggestions.length >= 3 || query.length < 3) {
      return { suggestions: localSuggestions };
    }

    try {
      const data = await this.fetchJson<JsonObject>('espell.fcgi', {
        term: query,
      });
      const spellResult = isJsonObject(data.espellresult) ? data.espellresult : {};
      const corrected = String(spellResult.correctedquery || '').trim();
      const suggestions = corrected && corrected !== query
        ? [...localSuggestions, corrected]
        : localSuggestions;
      return { suggestions: suggestions.slice(0, 8) };
    } catch {
      return { suggestions: localSuggestions };
    }
  }

  async stats(rawQuery?: string) {
    const query = String(rawQuery || '').trim();
    if (!query) throw new BadRequestException('Missing query');

    const total = await this.searchCount(query);
    const articleTypeBreakdown = await Promise.all(
      ARTICLE_TYPES.map(async (type) => ({
        type,
        count: await this.searchCount(`${query} AND ${type}[pt]`),
      })),
    );
    const currentYear = new Date().getFullYear();
    const yearlyDistribution = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const year = currentYear - 7 + index;
        return { year, count: await this.searchCount(`${query} AND ${year}[dp]`) };
      }),
    );

    return {
      query,
      total,
      articleTypeBreakdown: articleTypeBreakdown.filter((item) => item.count > 0),
      yearlyDistribution,
    };
  }

  async articleSearch(input: {
    query?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    dateFrom?: string;
    dateTo?: string;
    articleType?: string;
  }) {
    const query = String(input.query || '').trim();
    if (!query) throw new BadRequestException('Missing query');

    const page = this.positiveInt(input.page, 1);
    const limit = Math.min(50, this.positiveInt(input.limit, 10));
    const sortBy = input.sortBy === 'date' ? 'date' : 'relevance';
    let term = query;
    if (input.articleType?.trim()) term += ` AND ${input.articleType.trim()}[pt]`;
    if (input.dateFrom?.trim() || input.dateTo?.trim()) {
      term += ` AND ${input.dateFrom?.trim() || '1900/01/01'}:${input.dateTo?.trim() || '3000/12/31'}[dp]`;
    }

    const data = await this.fetchJson<JsonObject>('esearch.fcgi', {
      term,
      retmax: limit,
      retstart: (page - 1) * limit,
      sort: sortBy === 'date' ? 'pub date' : 'relevance',
    });
    const result = isJsonObject(data.esearchresult) ? data.esearchresult : {};
    const total = Number.parseInt(String(result.count || '0'), 10) || 0;
    const ids = Array.isArray(result.idlist) ? result.idlist.map(String) : [];
    const articles = await this.summaries(ids);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query,
      articles,
    };
  }

  async article(id: string) {
    const articleId = String(id || '').trim();
    if (!/^\d+$/.test(articleId)) throw new BadRequestException('Invalid PubMed article id');
    const articles = await this.summaries([articleId]);
    if (!articles[0]) throw new BadRequestException('Article not found');
    return articles[0];
  }

  private async searchCount(term: string) {
    try {
      const data = await this.fetchJson<JsonObject>('esearch.fcgi', {
        term,
        retmax: 0,
      });
      const result = isJsonObject(data.esearchresult) ? data.esearchresult : {};
      return Number.parseInt(String(result.count || '0'), 10) || 0;
    } catch {
      return 0;
    }
  }

  private async summaries(ids: string[]): Promise<ArticleSummary[]> {
    if (ids.length === 0) return [];
    const data = await this.fetchJson<JsonObject>('esummary.fcgi', {
      id: ids.join(','),
    });
    const result = isJsonObject(data.result) ? data.result : {};
    return ids
      .filter((id) => isJsonObject(result[id]))
      .map((id) => this.parseSummary(id, result[id] as JsonObject));
  }

  private parseSummary(id: string, entry: JsonObject): ArticleSummary {
    const articleIds = Array.isArray(entry.articleids)
      ? entry.articleids.filter(isJsonObject)
      : [];
    const doi = articleIds.find((item) => item.idtype === 'doi')?.value || '';
    const pmcid = articleIds.find((item) => item.idtype === 'pmc')?.value || '';
    const authors = Array.isArray(entry.authors)
      ? entry.authors
          .filter(isJsonObject)
          .filter((author) => Boolean(author.name))
          .map((author) => String(author.name))
          .slice(0, 6)
      : [];
    return {
      id,
      title: String(entry.title || 'Untitled'),
      authors,
      journal: String(entry.fulljournalname || entry.source || ''),
      pubDate: String(entry.pubdate || entry.epubdate || entry.sortpubdate || ''),
      abstract: '',
      articleTypes: Array.isArray(entry.pubtype) ? entry.pubtype.map(String) : [],
      doi: String(doi),
      pmcid: String(pmcid),
      citationCount: 0,
      fullTextUrl: pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/` : '',
    };
  }

  private async fetchJson<T>(endpoint: string, params: Record<string, string | number>) {
    const search = new URLSearchParams({
      db: 'pubmed',
      tool: NCBI_TOOL,
      email: NCBI_EMAIL,
      retmode: 'json',
    });
    for (const [key, value] of Object.entries(params)) search.set(key, String(value));
    try {
      const response = await fetch(`${NCBI_BASE}/${endpoint}?${search.toString()}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`NCBI error: ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('PubMed service is temporarily unavailable.');
    }
  }

  private positiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
