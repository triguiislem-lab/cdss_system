import { useRoute } from "wouter";
import { useGetArticle } from "@/lib/api-client";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Share2,
  BookmarkPlus,
  Users,
  Tag,
  BookOpen,
  Quote,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { Skeleton } from "@/components/atoms/skeleton";
import { Separator } from "@/components/atoms/separator";
import { useI18n } from "@/i18n/I18nProvider";

export default function ArticleDetail() {
  const { t } = useI18n();
  const [, params] = useRoute("/article/:id");
  const id = params?.id ?? "";

  const { data: article, isLoading, isError } = useGetArticle(
    { id },
    { query: { enabled: Boolean(id) } },
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-5xl space-y-8">
        <Skeleton className="h-8 w-24" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
        <Skeleton className="h-6 w-1/2" />
        <Separator />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="container mx-auto py-24 px-4 text-center">
        <h2 className="text-2xl font-semibold mb-4 text-destructive">{t("article.notFound")}</h2>
        <p className="text-muted-foreground mb-8">{t("article.notFoundText")}</p>
        <Button onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("article.goBack")}
        </Button>
      </div>
    );
  }

  const pubMeta = [
    article.pubDate,
    article.volume ? `;${article.volume}` : "",
    article.issue ? `(${article.issue})` : "",
    article.pages ? `:${article.pages}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl flex flex-col lg:flex-row gap-8">
      <main className="flex-1 min-w-0 space-y-8">
        <div>
          <button
            onClick={() => window.history.back()}
            className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("article.backToResults")}
          </button>

          <div className="flex flex-wrap gap-2 mb-4">
            {article.articleTypes?.map((type) => (
              <Badge key={type} variant="secondary" className="font-medium bg-muted text-foreground">
                {type}
              </Badge>
            ))}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground mb-6">
            {article.title}
          </h1>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-lg font-medium leading-relaxed">
                  {article.authors?.map((author, idx) => (
                    <span key={idx}>
                      <a
                        href={`/search?query=${encodeURIComponent(author)}`}
                        className="text-primary hover:underline"
                      >
                        {author}
                      </a>
                      {idx < (article.authors?.length || 0) - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
                {article.affiliations && article.affiliations.length > 0 && (
                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    {article.affiliations.map((aff, idx) => (
                      <p key={idx}>
                        <sup className="mr-1">{idx + 1}</sup>
                        {aff}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 mt-4 pt-4 border-t">
              <BookOpen className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-base">
                <span className="font-semibold text-foreground mr-2">{article.journal}</span>
                {pubMeta && <span className="text-muted-foreground">{pubMeta}</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-6 border-t">
              {article.doi && (
                <Button variant="outline" size="sm" asChild className="h-9">
                  <a href={`https://doi.org/${article.doi}`} target="_blank" rel="noopener noreferrer">
                    DOI: {article.doi} <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              )}
              {article.fullTextUrl && (
                <Button
                  size="sm"
                  asChild
                  className="h-9 bg-green-600 hover:bg-green-700 text-white border-none shadow-md"
                >
                  <a href={article.fullTextUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="w-4 h-4 mr-2" /> {t("search.freeFullText")}
                  </a>
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" className="h-9">
                  <BookmarkPlus className="w-4 h-4 mr-2" /> {t("article.save")}
                </Button>
                <Button variant="secondary" size="sm" className="h-9">
                  <Quote className="w-4 h-4 mr-2" /> {t("article.cite")}
                </Button>
                <Button variant="secondary" size="sm" className="h-9">
                  <Share2 className="w-4 h-4 mr-2" /> {t("article.share")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 pt-8">
          <h2 className="text-2xl font-bold border-b pb-2">{t("article.abstract")}</h2>
          <div className="prose prose-slate dark:prose-invert max-w-none text-foreground/90 leading-relaxed text-lg">
            {article.abstract ? (
              <p>{article.abstract}</p>
            ) : (
              <p className="italic text-muted-foreground">{t("article.noAbstract")}</p>
            )}
          </div>
        </div>

        {((article.keywords && article.keywords.length > 0) ||
          (article.meshTerms && article.meshTerms.length > 0)) && (
          <div className="space-y-6 pt-8">
            <h2 className="text-2xl font-bold border-b pb-2 flex items-center gap-2">
              <Tag className="w-5 h-5" /> {t("article.keywordsMesh")}
            </h2>

            {article.meshTerms && article.meshTerms.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("article.meshTerms")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {article.meshTerms.map((term) => (
                    <Badge key={term} variant="outline" className="font-normal text-sm bg-background border-border">
                      {term}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {article.keywords && article.keywords.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("article.keywords")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {article.keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="font-normal text-sm">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <aside className="w-full lg:w-80 shrink-0 space-y-6">
        <Card className="bg-muted/30 border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">{t("article.citationStats")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">{article.citationCount || 0}</div>
            <p className="text-sm text-muted-foreground">{t("article.citationsPmc")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("article.similar")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="group cursor-pointer">
                <h4 className="text-sm font-medium leading-tight group-hover:text-primary transition-colors mb-1 line-clamp-2">
                  {t("article.similarPlaceholder")}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {t("article.similarAuthor")}
                </p>
                {i < 3 && <Separator className="mt-4" />}
              </div>
            ))}
            <Button variant="link" className="w-full text-primary p-0 h-auto font-medium mt-2">
              {t("article.viewAllSimilar")} <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
