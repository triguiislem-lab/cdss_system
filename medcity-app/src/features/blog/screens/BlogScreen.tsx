import { useMemo, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { ArrowRight, Calendar, Clock, Eye, Search, Star, User } from "lucide-react";
import { useCms } from "@/contexts/CmsContext";
import { useI18n } from "@/i18n/I18nProvider";

const CATEGORY_COLORS: Record<string, string> = {
  Actualité: "bg-sky-50 text-sky-700 border-sky-200",
  Médecine: "bg-violet-50 text-violet-700 border-violet-200",
  Médicaments: "bg-blue-50 text-blue-700 border-blue-200",
  Conseils: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Recherche: "bg-amber-50 text-amber-700 border-amber-200",
  Technologie: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Esthétique: "bg-pink-50 text-pink-700 border-pink-200",
  Neurologie: "bg-purple-50 text-purple-700 border-purple-200",
  Cardiologie: "bg-rose-50 text-rose-700 border-rose-200",
  "Santé Numérique": "bg-teal-50 text-teal-700 border-teal-200",
};

export default function Blog() {
  const { t } = useI18n();
  const { posts } = useCms();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("__all");

  const published = useMemo(() => posts.filter((post) => post.status === "publié"), [posts]);
  const categories = useMemo(() => ["__all", ...Array.from(new Set(published.map((post) => post.category)))], [published]);

  const visible = published.filter((post) => {
    const query = search.trim().toLowerCase();
    const matchesCategory = activeCategory === "__all" || post.category === activeCategory;
    const matchesSearch = !query || [post.title, post.excerpt, post.author, ...post.tags].some((value) => value.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const featured = visible.filter((post) => post.featured);
  const regular = visible.filter((post) => !post.featured);

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden bg-primary px-4 py-20 text-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-1/4 top-0 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-48 w-96 rounded-full bg-cyan-400/30 blur-3xl" />
        </div>
        <div className="container relative z-10 mx-auto max-w-3xl">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-5">{t("blog.badge")}</Badge>
          <h1 className="mb-4 text-4xl font-extrabold leading-tight text-white md:text-5xl">{t("blog.title")}</h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-white/70">{t("blog.subtitle")}</p>

          <div className="relative mx-auto mt-8 max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("blog.searchPlaceholder")}
              className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/40 transition-all focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-none">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeCategory === category
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {category === "__all" ? t("blog.all") : category}
                {category !== "__all" && <span className="ml-1.5 opacity-60">{published.filter((post) => post.category === category).length}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-12">
        {featured.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">{t("blog.featured")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {featured.map((post) => <PostCard key={post.id} post={post} featured />)}
            </div>
          </section>
        )}

        {regular.length > 0 && (
          <section>
            {featured.length > 0 && <h2 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-500">{t("blog.allArticles")}</h2>}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {regular.map((post) => <PostCard key={post.id} post={post} />)}
            </div>
          </section>
        )}

        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
            <Search className="h-12 w-12 opacity-30" />
            <p className="text-lg font-semibold">{t("blog.emptyTitle")}</p>
            <p className="text-sm">{t("blog.emptyText")}</p>
            <button
              onClick={() => {
                setSearch("");
                setActiveCategory("__all");
              }}
              className="mt-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {t("blog.resetFilters")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post, featured = false }: { post: ReturnType<typeof useCms>["posts"][number]; featured?: boolean }) {
  const { t } = useI18n();

  return (
    <article className={`group cursor-pointer overflow-hidden border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${featured ? "rounded-3xl" : "rounded-2xl"}`}>
      <div className={`relative overflow-hidden ${featured ? "h-52" : "h-44"}`}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${post.coverColor}`} />
        )}
        {featured && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-white shadow">
            <Star className="h-3 w-3 fill-white" /> {t("blog.featuredBadge")}
          </div>
        )}
        <div className="absolute right-3 top-3">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${CATEGORY_COLORS[post.category] ?? "bg-white text-slate-600 border-slate-200"}`}>
            {post.category}
          </span>
        </div>
      </div>
      <div className={featured ? "p-6" : "p-5"}>
        <h3 className={`${featured ? "text-lg" : "text-base"} mb-2 font-bold leading-snug text-slate-900 transition-colors group-hover:text-primary line-clamp-2`}>
          {post.title}
        </h3>
        <p className={`${featured ? "text-sm" : "text-xs"} mb-4 line-clamp-2 leading-relaxed text-slate-500`}>{post.excerpt}</p>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-1 truncate"><User className="h-3 w-3" />{post.author}</span>
            {post.publishedAt && <span className="hidden items-center gap-1 sm:flex"><Calendar className="h-3 w-3" />{post.publishedAt}</span>}
          </div>
          <div className="flex items-center gap-2">
            {post.views > 0 && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.views.toLocaleString("fr")}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime} {t("blog.minRead")}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm font-semibold text-primary">
          {t("blog.readMore")} <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </article>
  );
}
