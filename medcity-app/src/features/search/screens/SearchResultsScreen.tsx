import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSearchArticles, useGetSearchStats, SearchArticlesSortBy } from "@/lib/api-client";
import { Calendar, Filter, ChevronDown, ChevronLeft, ChevronRight, FileText, BarChart3 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select";
import { Skeleton } from "@/components/atoms/skeleton";
import { Separator } from "@/components/atoms/separator";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from "wouter";
import { useI18n } from "@/i18n/I18nProvider";

export default function SearchResults() {
  const { t } = useI18n();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const query = searchParams.get("query") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const sortParam = searchParams.get("sortBy") as SearchArticlesSortBy || "relevance";

  const [page, setPage] = useState(pageParam);
  const [sortBy, setSortBy] = useState<SearchArticlesSortBy>(sortParam);

  // Keep URL in sync with state changes
  useEffect(() => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("page", page.toString());
    newParams.set("sortBy", sortBy);
    window.history.replaceState(null, "", `?${newParams.toString()}`);
  }, [page, sortBy]);

  const { data: results, isLoading: isLoadingResults, isError } = useSearchArticles(
    { query, page, limit: 10, sortBy },
    { query: { enabled: !!query, keepPreviousData: true } }
  );

  const { data: stats, isLoading: isLoadingStats } = useGetSearchStats(
    { query },
    { query: { enabled: !!query } }
  );

  if (!query) {
    return (
      <div className="container mx-auto py-24 px-4 text-center">
        <h2 className="text-2xl font-semibold mb-4">{t("search.noQuery")}</h2>
        <Button asChild><Link href="/">{t("search.returnHome")}</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
      {/* Sidebar Filters & Stats */}
      <aside className="w-full md:w-72 shrink-0 space-y-6">
        <div className="sticky top-24 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" /> {t("search.filters")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("search.sortBy")}</label>
                <Select value={sortBy} onValueChange={(val) => { setSortBy(val as SearchArticlesSortBy); setPage(1); }}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder={t("search.sortBy")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">{t("search.bestMatch")}</SelectItem>
                    <SelectItem value="date">{t("search.mostRecent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("search.dateRange")}</label>
                <div className="grid gap-2 text-sm">
                  <button className="flex items-center justify-between text-left py-1 hover:text-primary transition-colors">
                    <span>{t("search.anyTime")}</span>
                    <div className="w-4 h-4 rounded-full border-4 border-primary bg-background"></div>
                  </button>
                  <button className="flex items-center justify-between text-left py-1 text-muted-foreground hover:text-foreground transition-colors">
                    <span>{t("search.lastYear")}</span>
                    <div className="w-4 h-4 rounded-full border border-input"></div>
                  </button>
                  <button className="flex items-center justify-between text-left py-1 text-muted-foreground hover:text-foreground transition-colors">
                    <span>{t("search.lastFiveYears")}</span>
                    <div className="w-4 h-4 rounded-full border border-input"></div>
                  </button>
                  <button className="flex items-center justify-between text-left py-1 text-muted-foreground hover:text-foreground transition-colors">
                    <span>{t("search.customRange")}</span>
                    <div className="w-4 h-4 rounded-full border border-input"></div>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> {t("search.insights")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : stats ? (
                <div className="space-y-6">
                  {stats.yearlyDistribution && stats.yearlyDistribution.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("search.publicationsByYear")}</label>
                      <div className="h-32 w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.yearlyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip 
                              cursor={{ fill: 'hsl(var(--muted))' }}
                              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {stats.articleTypeBreakdown && stats.articleTypeBreakdown.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("search.articleTypes")}</label>
                      <div className="space-y-2 mt-2">
                        {stats.articleTypeBreakdown.slice(0, 5).map((type) => (
                          <div key={type.type} className="flex items-center justify-between text-sm">
                            <span className="text-foreground truncate pr-2" title={type.type}>{type.type}</span>
                            <Badge variant="secondary" className="font-mono text-xs">{type.count.toLocaleString()}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </aside>

      {/* Main Results Area */}
      <main className="flex-1 min-w-0">
        <div className="mb-6 pb-4 border-b">
          <h1 className="text-2xl font-bold mb-2">{t("search.resultsTitle")}</h1>
          {isLoadingResults ? (
            <Skeleton className="h-5 w-64" />
          ) : results ? (
            <p className="text-muted-foreground text-sm">
              {t("search.resultsSummary", {
                start: (results.page - 1) * results.limit + 1,
                end: Math.min(results.page * results.limit, results.total),
                total: results.total.toLocaleString(),
                query,
              })}
            </p>
          ) : isError ? (
            <p className="text-destructive">{t("search.error")}</p>
          ) : null}
        </div>

        <div className="space-y-6">
          {isLoadingResults ? (
            // Loading Skeletons
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : results?.articles.length ? (
            <>
              {results.articles.map((article) => (
                <Card key={article.id} className="hover-elevate transition-all border-border/60">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-xl font-semibold leading-tight text-primary hover:underline">
                          <Link href={`/article/${article.id}`}>
                            {article.title}
                          </Link>
                        </h2>
                        {article.fullTextUrl && (
                          <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-700 border-green-500/20 whitespace-nowrap">
                            {t("search.freeFullText")}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {article.authors?.join(", ")}
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm font-medium">
                        <span className="text-foreground">{article.journal}</span>
                        <span className="text-muted-foreground flex items-center"><Calendar className="w-3 h-3 mr-1"/> {article.pubDate?.split(' ')[0]}</span>
                      </div>
                      
                      {article.abstract && (
                        <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3 mt-1">
                          {article.abstract}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-4 border-t border-border/50">
                        {article.articleTypes?.map(type => (
                          <Badge key={type} variant="secondary" className="text-xs font-normal">
                            {type}
                          </Badge>
                        ))}
                        {article.doi && (
                          <span className="text-xs text-muted-foreground ml-auto font-mono">
                            DOI: {article.doi}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {results.totalPages > 1 && (
                <div className="flex items-center justify-between pt-8 pb-12">
                  <Button 
                    variant="outline" 
                    disabled={page === 1}
                    onClick={() => { setPage(p => p - 1); window.scrollTo(0,0); }}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" /> {t("search.previous")}
                  </Button>
                  <span className="text-sm text-muted-foreground font-medium">
                    {t("search.pageOf", { page, totalPages: results.totalPages.toLocaleString() })}
                  </span>
                  <Button 
                    variant="outline" 
                    disabled={page >= results.totalPages}
                    onClick={() => { setPage(p => p + 1); window.scrollTo(0,0); }}
                  >
                    {t("search.next")} <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="py-20 text-center border rounded-xl bg-muted/20">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("search.noResults")}</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                {t("search.noResultsHelp", { query })}
              </p>
              <Button onClick={() => setPage(1)}>
                {t("search.retry")}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
