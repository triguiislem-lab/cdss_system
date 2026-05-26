import type { Plugin } from "vite";
import { XMLParser } from "fast-xml-parser";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_TOOL = "medcity-app";
const NCBI_EMAIL = "dev@medcity.local";

function ncbiParams(extra: Record<string, string | number | undefined>) {
  const params = new URLSearchParams({
    db: "pubmed",
    tool: NCBI_TOOL,
    email: NCBI_EMAIL,
    retmode: "json",
  });

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  return params.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNCBIJson(endpoint: string, params: string): Promise<any> {
  const url = `${NCBI_BASE}/${endpoint}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`NCBI error: ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return res.json();
}

async function fetchNCBIXml(endpoint: string, params: string): Promise<string> {
  const url = `${NCBI_BASE}/${endpoint}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`NCBI error: ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return res.text();
}

function sendJson(res: import("http").ServerResponse, status: number, body: unknown) {
  if (res.headersSent || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function getApiErrorStatus(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 600) return status;
  return 500;
}

function getApiErrorMessage(status: number) {
  if (status === 429) return "PubMed rate limit reached. Please wait a moment and retry.";
  if (status >= 500) return "PubMed service is temporarily unavailable.";
  return "API request failed";
}

function parseNumber(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseSummaryEntry(uid: string, entry: Record<string, unknown>) {
  const authors: string[] = Array.isArray(entry.authors)
    ? (entry.authors as Array<{ name: string }>)
        .filter((a) => a?.name)
        .map((a) => a.name)
        .slice(0, 6)
    : [];

  const articleTypes: string[] = Array.isArray(entry.pubtype)
    ? (entry.pubtype as string[])
    : [];

  let doi = "";
  let pmcid = "";
  let fullTextUrl = "";

  if (Array.isArray(entry.articleids)) {
    for (const aid of entry.articleids as Array<{ idtype: string; value: string }>) {
      if (aid.idtype === "doi") doi = aid.value;
      if (aid.idtype === "pmc") {
        pmcid = aid.value;
        fullTextUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${aid.value}/`;
      }
    }
  }

  const pubDate =
    (entry.pubdate as string) ||
    (entry.epubdate as string) ||
    (entry.sortpubdate as string) ||
    "";

  return {
    id: uid,
    title: (entry.title as string) || "Untitled",
    authors,
    journal: (entry.fulljournalname as string) || (entry.source as string) || "",
    pubDate,
    abstract: "",
    articleTypes,
    doi,
    pmcid,
    citationCount: 0,
    fullTextUrl,
  };
}

const ARTICLE_TYPES = [
  "Review",
  "Clinical Trial",
  "Randomized Controlled Trial",
  "Meta-Analysis",
  "Systematic Review",
  "Case Reports",
  "Observational Study",
];

const COMMON_TERMS = [
  "cancer",
  "diabetes",
  "COVID-19",
  "hypertension",
  "Alzheimer",
  "cardiovascular",
  "obesity",
  "depression",
  "immunotherapy",
  "CRISPR",
  "machine learning",
  "microbiome",
  "inflammation",
  "vaccine",
  "gene therapy",
  "stroke",
  "sepsis",
  "Parkinson",
  "SARS-CoV-2",
  "clinical trial",
];

async function handleSuggestions(url: URL, res: import("http").ServerResponse) {
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Missing query" });
    return;
  }

  const lq = query.toLowerCase();
  const localSuggestions = COMMON_TERMS.filter((t) => t.toLowerCase().startsWith(lq)).slice(0, 5);

  if (localSuggestions.length >= 3 || query.length < 3) {
    sendJson(res, 200, { suggestions: localSuggestions });
    return;
  }

  try {
    const data = await fetchNCBIJson(
      "espell.fcgi",
      new URLSearchParams({
        db: "pubmed",
        term: query,
        tool: NCBI_TOOL,
        email: NCBI_EMAIL,
        retmode: "json",
      }).toString(),
    );

    const corrected = data?.espellresult?.correctedquery;
    const suggestions = [...localSuggestions];
    if (corrected && corrected !== query && !suggestions.includes(corrected)) {
      suggestions.push(corrected);
    }

    sendJson(res, 200, { suggestions: suggestions.slice(0, 8) });
  } catch {
    sendJson(res, 200, { suggestions: localSuggestions });
  }
}

async function handleStats(url: URL, res: import("http").ServerResponse) {
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Missing query" });
    return;
  }

  const baseData = await fetchNCBIJson("esearch.fcgi", ncbiParams({ term: query, retmax: 0 }));
  const total = parseInt(baseData?.esearchresult?.count ?? "0", 10);

  const typeBreakdownPromises = ARTICLE_TYPES.map(async (type) => {
    try {
      const data = await fetchNCBIJson(
        "esearch.fcgi",
        ncbiParams({ term: `${query} AND ${type}[pt]`, retmax: 0 }),
      );
      const count = parseInt(data?.esearchresult?.count ?? "0", 10);
      return { type, count };
    } catch {
      return { type, count: 0 };
    }
  });

  const currentYear = new Date().getFullYear();
  const yearlyPromises = Array.from({ length: 8 }, (_, i) => {
    const year = currentYear - 7 + i;
    return fetchNCBIJson(
      "esearch.fcgi",
      ncbiParams({ term: `${query} AND ${year}[dp]`, retmax: 0 }),
    )
      .then((data) => ({ year, count: parseInt(data?.esearchresult?.count ?? "0", 10) }))
      .catch(() => ({ year, count: 0 }));
  });

  const [articleTypeBreakdown, yearlyDistribution] = await Promise.all([
    Promise.all(typeBreakdownPromises),
    Promise.all(yearlyPromises),
  ]);

  sendJson(res, 200, {
    query,
    total,
    articleTypeBreakdown: articleTypeBreakdown.filter((t) => t.count > 0),
    yearlyDistribution,
  });
}

async function handleArticleSearch(url: URL, res: import("http").ServerResponse) {
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Missing query" });
    return;
  }

  const page = Math.max(1, parseNumber(url.searchParams.get("page"), 1));
  const limit = Math.min(50, Math.max(1, parseNumber(url.searchParams.get("limit"), 10)));
  const sortBy = (url.searchParams.get("sortBy") ?? "relevance") === "date" ? "date" : "relevance";
  const dateFrom = (url.searchParams.get("dateFrom") ?? "").trim();
  const dateTo = (url.searchParams.get("dateTo") ?? "").trim();
  const articleType = (url.searchParams.get("articleType") ?? "").trim();

  let term = query;
  if (articleType) term = `${term} AND ${articleType}[pt]`;
  if (dateFrom || dateTo) {
    const from = dateFrom || "1900/01/01";
    const to = dateTo || "3000/12/31";
    term = `${term} AND ${from}:${to}[dp]`;
  }

  const retstart = (page - 1) * limit;
  const esearchData = await fetchNCBIJson(
    "esearch.fcgi",
    ncbiParams({
      term,
      retmax: limit,
      retstart,
      sort: sortBy === "date" ? "pub date" : "relevance",
    }),
  );

  const esearchResult = esearchData?.esearchresult;
  const total = parseInt(esearchResult?.count ?? "0", 10);
  const ids: string[] = esearchResult?.idlist ?? [];

  if (ids.length === 0) {
    sendJson(res, 200, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query,
      articles: [],
    });
    return;
  }

  const esummaryData = await fetchNCBIJson("esummary.fcgi", ncbiParams({ id: ids.join(",") }));
  const result = esummaryData?.result ?? {};
  const articles = ids.filter((id) => result[id]).map((id) => parseSummaryEntry(id, result[id]));

  sendJson(res, 200, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    query,
    articles,
  });
}

async function handleArticleDetail(id: string, res: import("http").ServerResponse) {
  const xml = await fetchNCBIXml(
    "efetch.fcgi",
    new URLSearchParams({
      db: "pubmed",
      id,
      retmode: "xml",
      tool: NCBI_TOOL,
      email: NCBI_EMAIL,
    }).toString(),
  );

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = parser.parse(xml);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const article: any = parsed?.PubmedArticleSet?.PubmedArticle?.[0];

  if (!article) {
    sendJson(res, 404, { error: "Article not found" });
    return;
  }

  const citation = article?.MedlineCitation?.[0] ?? article?.MedlineCitation;
  const articleEl = citation?.Article?.[0] ?? citation?.Article;

  const titleEl = articleEl?.ArticleTitle;
  const title =
    (Array.isArray(titleEl)
      ? titleEl
          .map((t: unknown) => (typeof t === "object" ? (t as Record<string, unknown>)["#text"] || "" : t))
          .join(" ")
      : typeof titleEl === "object"
        ? (titleEl as Record<string, unknown>)["#text"]
        : titleEl) ?? "";

  const authorList = articleEl?.AuthorList?.[0]?.Author ?? articleEl?.AuthorList?.Author ?? [];
  const authors: string[] = [];
  const affiliations: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const author of authorList as Array<any>) {
    const lastName = author.LastName?.[0] ?? author.LastName ?? "";
    const foreName = author.ForeName?.[0] ?? author.ForeName ?? "";
    const initials = author.Initials?.[0] ?? author.Initials ?? "";
    if (lastName) {
      authors.push(foreName ? `${foreName} ${lastName}` : `${initials} ${lastName}`.trim());
    } else if (author.CollectiveName?.[0] || author.CollectiveName) {
      authors.push((author.CollectiveName?.[0] ?? author.CollectiveName) as string);
    }

    const affList = author.AffiliationInfo ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const aff of affList as Array<any>) {
      const affText = aff.Affiliation?.[0] ?? aff.Affiliation;
      if (affText && !affiliations.includes(affText as string)) {
        affiliations.push(affText as string);
      }
    }
  }

  const abstractTexts = articleEl?.Abstract?.[0]?.AbstractText ?? articleEl?.Abstract?.AbstractText ?? [];
  const abstract = (abstractTexts as Array<unknown>)
    .map((t) => {
      if (typeof t === "string") return t;
      if (typeof t === "object" && t !== null) {
        const obj = t as Record<string, unknown>;
        const label = obj["@_Label"] ? `${obj["@_Label"]}: ` : "";
        const text = obj["#text"] ?? "";
        return `${label}${text}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  const journal = articleEl?.Journal?.[0] ?? articleEl?.Journal;
  const journalName = journal?.Title?.[0] ?? journal?.Title ?? journal?.ISOAbbreviation?.[0] ?? journal?.ISOAbbreviation ?? "";
  const journalIssue = journal?.JournalIssue?.[0] ?? journal?.JournalIssue;
  const volume = journalIssue?.Volume?.[0] ?? journalIssue?.Volume ?? "";
  const issue = journalIssue?.Issue?.[0] ?? journalIssue?.Issue ?? "";
  const pubDateEl = journalIssue?.PubDate?.[0] ?? journalIssue?.PubDate;
  const pubDate = pubDateEl
    ? [pubDateEl?.Year?.[0] ?? pubDateEl?.Year, pubDateEl?.Month?.[0] ?? pubDateEl?.Month, pubDateEl?.Day?.[0] ?? pubDateEl?.Day]
        .filter(Boolean)
        .join(" ")
    : "";

  const pages = articleEl?.Pagination?.[0]?.MedlinePgn?.[0] ?? articleEl?.Pagination?.MedlinePgn ?? "";

  const meshHeadingList = citation?.MeshHeadingList?.[0]?.MeshHeading ?? citation?.MeshHeadingList?.MeshHeading ?? [];
  const meshTerms: string[] = (meshHeadingList as Array<Record<string, unknown>>)
    .map((mh) => {
      const dn = (mh as any).DescriptorName?.[0] ?? (mh as any).DescriptorName;
      if (typeof dn === "object" && dn !== null) return (dn as any)["#text"] ?? "";
      return (dn ?? "") as string;
    })
    .filter(Boolean);

  const keywordList = citation?.KeywordList?.[0]?.Keyword ?? citation?.KeywordList?.Keyword ?? [];
  const keywords: string[] = (keywordList as Array<unknown>)
    .map((kw) => {
      if (typeof kw === "string") return kw;
      if (typeof kw === "object" && kw !== null) return (kw as any)["#text"] ?? "";
      return "";
    })
    .filter(Boolean);

  const pubTypesRaw = articleEl?.PublicationTypeList?.[0]?.PublicationType ?? articleEl?.PublicationTypeList?.PublicationType ?? [];
  const articleTypes: string[] = (pubTypesRaw as Array<unknown>)
    .map((pt) => {
      if (typeof pt === "string") return pt;
      if (typeof pt === "object" && pt !== null) return (pt as any)["#text"] ?? "";
      return "";
    })
    .filter(Boolean);

  const elIds = articleEl?.ELocationID ?? [];
  let doi = "";
  for (const el of elIds as Array<Record<string, unknown>>) {
    if ((el as any)["@_EIdType"] === "doi") {
      doi = ((el as any)["#text"] as string) ?? "";
    }
  }

  const articleIds = article?.PubmedData?.[0]?.ArticleIdList?.[0]?.ArticleId ?? [];
  let pmcid = "";
  let fullTextUrl = "";
  for (const aid of articleIds as Array<Record<string, unknown>>) {
    if ((aid as any)["@_IdType"] === "pmc") {
      pmcid = ((aid as any)["#text"] as string) ?? "";
      fullTextUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`;
    }
  }

  const language = citation?.Article?.[0]?.Language?.[0] ?? citation?.Article?.Language?.[0] ?? "eng";
  const issn = journal?.ISSN?.[0]?.["#text"] ?? journal?.ISSN?.[0] ?? journal?.ISSN ?? "";

  sendJson(res, 200, {
    id,
    title: String(title),
    authors,
    journal: String(journalName),
    pubDate: String(pubDate),
    abstract: String(abstract),
    articleTypes,
    doi: String(doi),
    pmcid: String(pmcid),
    citationCount: 0,
    fullTextUrl: String(fullTextUrl),
    keywords,
    meshTerms,
    affiliations,
    language: String(language),
    issn: String(issn),
    volume: String(volume),
    issue: String(issue),
    pages: String(pages),
    conflictOfInterest: "",
  });
}

function apiMiddleware() {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return async (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => {
    try {
      if (!req.url) return next();
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/api/")) return next();

      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }

      if (url.pathname === "/api/search/suggestions") {
        await handleSuggestions(url, res);
        return;
      }

      if (url.pathname === "/api/search/stats") {
        await handleStats(url, res);
        return;
      }

      if (url.pathname === "/api/articles/search") {
        await handleArticleSearch(url, res);
        return;
      }

      const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
      if (articleMatch) {
        await handleArticleDetail(decodeURIComponent(articleMatch[1] ?? ""), res);
        return;
      }

      return next();
    } catch (err) {
      const status = getApiErrorStatus(err);
      sendJson(res, status, { error: getApiErrorMessage(status) });
    }
  };
}

export function pubmedApiPlugin(): Plugin {
  return {
    name: "medcity-pubmed-api",
    configureServer(server) {
      server.middlewares.use(apiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware());
    },
  };
}
