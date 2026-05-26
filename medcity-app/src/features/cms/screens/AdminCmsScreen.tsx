import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Archive,
  Baby,
  BarChart2,
  Bone,
  BookMarked,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  Eye,
  FilePlus2,
  FileText,
  Globe,
  Handshake,
  Heart,
  Image,
  LayoutDashboard,
  Lightbulb,
  Link2,
  MessageSquare,
  Network,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Star,
  Stethoscope,
  Syringe,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MetricCard } from "@/components/molecules/MetricCard";
import { StatusToggle } from "@/components/molecules/StatusToggle";
import { CdssModal, FormField as Field } from "@/features/cdss/components/DialogPrimitives";
import { useI18n } from "@/i18n/I18nProvider";
import {
  POST_CATEGORIES,
  calcReadTime,
  generateSlug,
  useCms,
  type Partner,
  type Post,
  type PostCategory,
  type PostStatus,
  type Specialty,
  type Testimonial,
  type WhyFeature,
} from "@/contexts/CmsContext";

type SectionId = "articles" | "avis" | "specialites" | "partenaires" | "fonctionnalites";
type PostForm = Omit<Post, "id" | "views" | "commentsCount" | "publishedAt" | "updatedAt">;
type PostTab = "content" | "seo" | "settings";

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Baby,
  Bone,
  BookMarked,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  Heart,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Network,
  Pill,
  Shield,
  Star,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
  Wind,
  Zap,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const SPECIALTY_COLORS = [
  { text: "text-blue-500", bg: "bg-blue-500/10", dot: "bg-blue-500", label: "Bleu" },
  { text: "text-purple-500", bg: "bg-purple-500/10", dot: "bg-purple-500", label: "Violet" },
  { text: "text-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500", label: "Ambre" },
  { text: "text-red-500", bg: "bg-red-500/10", dot: "bg-red-500", label: "Rouge" },
  { text: "text-green-500", bg: "bg-green-500/10", dot: "bg-green-500", label: "Vert" },
  { text: "text-pink-500", bg: "bg-pink-500/10", dot: "bg-pink-500", label: "Rose" },
  { text: "text-cyan-500", bg: "bg-cyan-500/10", dot: "bg-cyan-500", label: "Cyan" },
  { text: "text-orange-500", bg: "bg-orange-500/10", dot: "bg-orange-500", label: "Orange" },
  { text: "text-teal-500", bg: "bg-teal-500/10", dot: "bg-teal-500", label: "Turquoise" },
  { text: "text-indigo-500", bg: "bg-indigo-500/10", dot: "bg-indigo-500", label: "Indigo" },
];

const GRADIENTS = [
  "from-blue-600 to-blue-400",
  "from-violet-600 to-violet-400",
  "from-cyan-600 to-cyan-400",
  "from-emerald-600 to-emerald-400",
  "from-rose-600 to-rose-400",
  "from-amber-600 to-amber-400",
  "from-indigo-600 to-indigo-400",
  "from-teal-600 to-teal-400",
];

const COVER_COLORS = [
  "from-blue-500 to-blue-600",
  "from-violet-500 to-violet-600",
  "from-emerald-500 to-emerald-600",
  "from-rose-500 to-rose-600",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-cyan-600",
  "from-teal-500 to-teal-600",
  "from-slate-500 to-slate-600",
  "from-indigo-500 to-indigo-600",
  "from-pink-500 to-rose-600",
];

const tabs = [
  { id: "articles" as SectionId, labelKey: "cms.tabs.articles", icon: FileText },
  { id: "avis" as SectionId, labelKey: "cms.tabs.testimonials", icon: Star },
  { id: "specialites" as SectionId, labelKey: "cms.tabs.specialties", icon: Stethoscope },
  { id: "partenaires" as SectionId, labelKey: "cms.tabs.partners", icon: Handshake },
  { id: "fonctionnalites" as SectionId, labelKey: "cms.tabs.features", icon: Lightbulb },
];

const statusMeta: Record<PostStatus, { labelKey: string; cls: string; icon: LucideIcon }> = {
  publié: { labelKey: "cms.status.published", cls: "bg-success-soft text-success border-success/30", icon: CheckCircle2 },
  brouillon: { labelKey: "cms.status.draft", cls: "bg-warning-soft text-warning-foreground border-warning/30", icon: Clock },
  archivé: { labelKey: "cms.status.archived", cls: "bg-muted text-muted-foreground border-border", icon: Archive },
};

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20";

const EMPTY_POST_FORM: PostForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Actualité",
  tags: [],
  author: "MedCity",
  imageUrl: "",
  coverColor: "from-blue-500 to-blue-600",
  status: "brouillon",
  featured: false,
  scheduledDate: "",
  readTime: 1,
  metaTitle: "",
  metaDescription: "",
};

export default function AdminCMS() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SectionId>("articles");

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("cms.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("cms.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-smooth ${
              activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {t(labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "articles" && <ArticlesSection />}
      {activeTab === "avis" && <TestimonialsSection />}
      {activeTab === "specialites" && <SpecialtiesSection />}
      {activeTab === "partenaires" && <PartnersSection />}
      {activeTab === "fonctionnalites" && <FeaturesSection />}
    </div>
  );
}

function ArticlesSection() {
  const { t, language } = useI18n();
  const { posts, addPost, updatePost, deletePost } = useCms();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesFilter = filter === "all" || post.status === filter;
      const matchesQuery = !q || [post.title, post.author, post.category, post.slug, ...post.tags].some((value) => value.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [filter, posts, search]);

  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);

  function savePost(form: PostForm, id?: number) {
    if (id) updatePost(id, form);
    else addPost(form);
    setEditing(null);
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={t("cms.articles.total")} value={posts.length} icon={FileText} iconClassName="text-primary" sub={t("cms.articles.archivedCount", { count: posts.filter((post) => post.status === "archivé").length })} />
        <MetricCard label={t("cms.articles.published")} value={posts.filter((post) => post.status === "publié").length} icon={Globe} iconClassName="text-success" sub={t("cms.articles.featuredCount", { count: posts.filter((post) => post.featured).length })} />
        <MetricCard label={t("cms.articles.drafts")} value={posts.filter((post) => post.status === "brouillon").length} icon={Clock} iconClassName="text-warning-foreground" sub={t("cms.articles.scheduledCount", { count: posts.filter((post) => post.scheduledDate).length })} />
        <MetricCard label={t("cms.articles.totalViews")} value={totalViews.toLocaleString(language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr")} icon={BarChart2} iconClassName="text-info" sub={<span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-3 w-3" /> {t("cms.articles.monthGrowth")}</span>} />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("cms.articles.searchPlaceholder")} className="flex-1 bg-transparent outline-none" />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "publié", "brouillon", "archivé"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-smooth ${
                  filter === status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {status === "all" ? t("common.all") : t(statusMeta[status].labelKey)}
              </button>
            ))}
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> {t("cms.articles.new")}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("cms.articles.empty")}</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t("cms.articles.table.article")}</th>
                  <th className="px-5 py-3 font-semibold">{t("common.category")}</th>
                  <th className="px-5 py-3 font-semibold">{t("cms.articles.table.author")}</th>
                  <th className="px-5 py-3 font-semibold">{t("cms.articles.table.status")}</th>
                  <th className="px-5 py-3 font-semibold">{t("cms.articles.table.views")}</th>
                  <th className="px-5 py-3 font-semibold">{t("cms.articles.table.reading")}</th>
                  <th className="px-5 py-3 font-semibold text-right">{t("cms.articles.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((post) => {
                  const meta = statusMeta[post.status];
                  return (
                    <tr key={post.id} className="hover:bg-muted/40 transition-smooth">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="h-11 w-11 rounded-lg overflow-hidden bg-primary-soft text-primary flex items-center justify-center shrink-0">
                            {post.imageUrl ? <img src={post.imageUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 font-semibold truncate">
                              {post.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                              {post.title || t("cms.articles.newArticle")}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">/{post.slug}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{post.category}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{post.author || "-"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                          <meta.icon className="h-3 w-3" /> {t(meta.labelKey)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{post.views.toLocaleString(language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr")}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{post.readTime} {t("blog.minRead")}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditing(post)} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                            <Edit2 className="h-3.5 w-3.5" /> {t("common.edit")}
                          </button>
                          <button onClick={() => setDeleteTarget(post)} className="inline-flex items-center gap-1 rounded-md bg-critical px-2.5 py-1.5 text-xs font-semibold text-critical-foreground hover:bg-critical/90">
                            <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PostModal
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={savePost}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={t("cms.articles.deleteTitle")}
          label={deleteTarget.title}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            deletePost(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function PostModal({ post, onSave, onClose }: { post: Post | null; onSave: (form: PostForm, id?: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<PostForm>(
    post
      ? {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          category: post.category,
          tags: [...post.tags],
          author: post.author,
          imageUrl: post.imageUrl,
          coverColor: post.coverColor,
          status: post.status,
          featured: post.featured,
          scheduledDate: post.scheduledDate,
          readTime: post.readTime,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
        }
      : EMPTY_POST_FORM,
  );
  const [tab, setTab] = useState<PostTab>("content");
  const [tagInput, setTagInput] = useState("");
  const [slugManual, setSlugManual] = useState(Boolean(post));

  useEffect(() => {
    if (!slugManual && form.title) {
      setForm((current) => ({ ...current, slug: generateSlug(current.title) }));
    }
  }, [form.title, slugManual]);

  useEffect(() => {
    setForm((current) => ({ ...current, readTime: calcReadTime(current.content) }));
  }, [form.content]);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || form.tags.includes(tag)) return;
    setForm((current) => ({ ...current, tags: [...current.tags, tag] }));
    setTagInput("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave(form, post?.id);
  }

  const wordCount = form.content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <CdssModal title={post ? t("cms.postModal.editTitle") : t("cms.postModal.newTitle")} onClose={onClose} maxWidth="sm:max-w-4xl">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {form.content ? t("cms.postModal.contentStats", { readTime: form.readTime, words: wordCount }) : t("cms.postModal.fillContent")}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {(["content", "seo", "settings"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"}`}
              >
                {item === "content" ? t("cms.postModal.tab.content") : item === "seo" ? "SEO" : t("cms.postModal.tab.publication")}
              </button>
            ))}
          </div>
        </div>

        {tab === "content" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("cms.postModal.coverImage")} full>
              <input value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://images.unsplash.com/..." className={inputCls} />
              {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-2 h-28 w-full rounded-xl border border-border object-cover" />}
            </Field>
            <Field label={t("cms.postModal.fallbackColor")} full>
              <div className="flex gap-2 flex-wrap">
                {COVER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, coverColor: color }))}
                    className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} transition-smooth ${form.coverColor === color ? "ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`}
                    aria-label={color}
                  />
                ))}
              </div>
            </Field>
            <Field label={t("cms.postModal.title")} full>
              <input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("cms.postModal.titlePlaceholder")} className={inputCls} />
            </Field>
            <Field label={t("cms.postModal.slug")} full>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/</span>
                  <input
                    value={form.slug}
                    onChange={(event) => {
                      setSlugManual(true);
                      setForm((current) => ({ ...current, slug: event.target.value }));
                    }}
                    placeholder="mon-article"
                    className={`${inputCls} pl-6 font-mono`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSlugManual(false);
                    setForm((current) => ({ ...current, slug: generateSlug(current.title) }));
                  }}
                  className="rounded-lg border border-input bg-background px-3 text-muted-foreground hover:bg-muted"
                  aria-label={t("cms.postModal.regenerateSlug")}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label={t("cms.postModal.excerpt")} full>
              <textarea value={form.excerpt} onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))} rows={3} placeholder={t("cms.postModal.excerptPlaceholder")} className={inputCls} />
            </Field>
            <Field label={t("cms.postModal.fullContent")} full>
              <textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} rows={8} placeholder={t("cms.postModal.fullContentPlaceholder")} className={`${inputCls} resize-y`} />
            </Field>
            <Field label={t("common.category")}>
              <div className="relative">
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as PostCategory }))} className={`${inputCls} appearance-none`}>
                  {POST_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Field>
            <Field label={t("cms.articles.table.author")}>
              <input value={form.author} onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} placeholder={t("cms.postModal.authorPlaceholder")} className={inputCls} />
            </Field>
            <Field label="Tags" full>
              <div className="mb-2 flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                    {tag}
                    <button type="button" onClick={() => setForm((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))} className="hover:text-critical">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={t("cms.postModal.tagPlaceholder")}
                  className={inputCls}
                />
                <button type="button" onClick={addTag} className="rounded-lg border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/10">
                  {t("cms.postModal.addTag")}
                </button>
              </div>
            </Field>
          </div>
        )}

        {tab === "seo" && (
          <div className="grid grid-cols-1 gap-4">
            <Field label={`Meta title (${form.metaTitle.length}/60)`}>
              <input value={form.metaTitle} onChange={(event) => setForm((current) => ({ ...current, metaTitle: event.target.value }))} placeholder={`${form.title || "Titre"} | MedCity`} className={inputCls} />
            </Field>
            <Field label={`Meta description (${form.metaDescription.length}/160)`}>
              <textarea value={form.metaDescription} onChange={(event) => setForm((current) => ({ ...current, metaDescription: event.target.value }))} rows={4} className={inputCls} />
            </Field>
            <Field label={t("cms.postModal.canonicalUrl")}>
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground">
                medcity.tn/blog/{form.slug || "votre-slug"}
              </div>
            </Field>
          </div>
        )}

        {tab === "settings" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("cms.articles.table.status")} full>
              <div className="grid grid-cols-3 gap-2">
                {(["brouillon", "publié", "archivé"] as PostStatus[]).map((status) => {
                  const meta = statusMeta[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, status }))}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        form.status === status ? `${meta.cls} ring-2 ring-primary/20` : "border-input bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <meta.icon className="h-3.5 w-3.5" /> {t(meta.labelKey)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={t("cms.postModal.scheduledDate")}>
              <input type="date" value={form.scheduledDate} onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))} className={inputCls} />
            </Field>
            <Field label={t("cms.postModal.readTime")}>
              <input type="number" min={1} max={60} value={form.readTime} onChange={(event) => setForm((current) => ({ ...current, readTime: Number(event.target.value) }))} className={inputCls} />
            </Field>
            <Field label={t("cms.postModal.featured")}>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, featured: !current.featured }))}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${
                  form.featured ? "bg-warning-soft text-warning-foreground border-warning/30" : "bg-background border-input hover:bg-muted"
                }`}
              >
                {form.featured ? t("cms.postModal.featuredOn") : t("cms.postModal.standardArticle")}
              </button>
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={!form.title.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {t("common.save")}
          </button>
        </div>
      </form>
    </CdssModal>
  );
}

function TestimonialsSection() {
  const { t } = useI18n();
  const { testimonials, addTestimonial, updateTestimonial, deleteTestimonial } = useCms();
  const [editing, setEditing] = useState<Testimonial | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Testimonial | null>(null);

  return (
    <>
      <SectionHeader
        title={t("cms.testimonials.summary", { total: testimonials.length, active: testimonials.filter((item) => item.active).length })}
        addLabel={t("cms.testimonials.new")}
        onAdd={() => setEditing("new")}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {testimonials.map((item) => (
          <EditableCard key={item.id} active={item.active} onToggle={() => updateTestimonial(item.id, { active: !item.active })} onEdit={() => setEditing(item)} onDelete={() => setDeleteTarget(item)}>
            <div className="flex gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= item.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />)}
            </div>
            <p className="text-sm text-muted-foreground italic leading-relaxed">"{item.text}"</p>
            <div className="mt-4">
              <p className="font-semibold">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.role}</p>
            </div>
          </EditableCard>
        ))}
      </div>
      {editing && <TestimonialModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={(data, id) => { id ? updateTestimonial(id, data) : addTestimonial(data); setEditing(null); }} />}
      {deleteTarget && <ConfirmModal title={t("cms.testimonials.deleteTitle")} label={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={() => { deleteTestimonial(deleteTarget.id); setDeleteTarget(null); }} />}
    </>
  );
}

function TestimonialModal({ item, onClose, onSave }: { item: Testimonial | null; onClose: () => void; onSave: (data: Omit<Testimonial, "id">, id?: number) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<Testimonial, "id">>(item ? { name: item.name, role: item.role, text: item.text, rating: item.rating, active: item.active } : { name: "", role: "", text: "", rating: 5, active: true });
  return (
    <SimpleFormModal title={item ? t("cms.testimonials.editTitle") : t("cms.testimonials.new")} onClose={onClose} onSubmit={() => onSave(form, item?.id)} disabled={!form.name.trim()}>
      <Field label={t("cms.field.name")}><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputCls} /></Field>
      <Field label={t("cms.testimonials.role")}><input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className={inputCls} /></Field>
      <Field label={t("cms.testimonials.testimonial")} full><textarea value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} rows={4} className={inputCls} /></Field>
      <Field label={t("cms.field.rating")}>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" onClick={() => setForm((current) => ({ ...current, rating: star }))}>
              <Star className={`h-6 w-6 ${star <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("cms.field.visibility")}><StatusToggle active={form.active} onToggle={() => setForm((current) => ({ ...current, active: !current.active }))} /></Field>
    </SimpleFormModal>
  );
}

function SpecialtiesSection() {
  const { t } = useI18n();
  const { specialties, addSpecialty, updateSpecialty, deleteSpecialty } = useCms();
  const [editing, setEditing] = useState<Specialty | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Specialty | null>(null);

  return (
    <>
      <SectionHeader title={t("cms.specialties.summary", { total: specialties.length, active: specialties.filter((item) => item.active).length })} addLabel={t("cms.specialties.new")} onAdd={() => setEditing("new")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {specialties.map((item) => {
          const Icon = ICON_MAP[item.iconName] ?? Stethoscope;
          return (
            <EditableCard key={item.id} active={item.active} onToggle={() => updateSpecialty(item.id, { active: !item.active })} onEdit={() => setEditing(item)} onDelete={() => setDeleteTarget(item)}>
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}><Icon className={`h-5 w-5 ${item.color}`} /></div>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              <p className="mt-3 truncate text-xs text-muted-foreground font-mono">query: {item.query}</p>
            </EditableCard>
          );
        })}
      </div>
      {editing && <SpecialtyModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={(data, id) => { id ? updateSpecialty(id, data) : addSpecialty(data); setEditing(null); }} />}
      {deleteTarget && <ConfirmModal title={t("cms.specialties.deleteTitle")} label={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={() => { deleteSpecialty(deleteTarget.id); setDeleteTarget(null); }} />}
    </>
  );
}

function SpecialtyModal({ item, onClose, onSave }: { item: Specialty | null; onClose: () => void; onSave: (data: Omit<Specialty, "id">, id?: number) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<Specialty, "id">>(item ? { name: item.name, description: item.description, iconName: item.iconName, color: item.color, bg: item.bg, query: item.query, active: item.active } : { name: "", description: "", iconName: "Stethoscope", color: "text-primary", bg: "bg-primary-soft", query: "", active: true });
  const Icon = ICON_MAP[form.iconName] ?? Stethoscope;
  return (
    <SimpleFormModal title={item ? t("cms.specialties.editTitle") : t("cms.specialties.new")} onClose={onClose} onSubmit={() => onSave(form, item?.id)} disabled={!form.name.trim()}>
      <Field label={t("cms.field.name")}><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputCls} /></Field>
      <Field label={t("cms.specialties.pubmedQuery")}><input value={form.query} onChange={(event) => setForm((current) => ({ ...current, query: event.target.value }))} className={`${inputCls} font-mono`} /></Field>
      <Field label={t("cms.field.description")} full><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} className={inputCls} /></Field>
      <Field label={t("cms.field.icon")}>
        <select value={form.iconName} onChange={(event) => setForm((current) => ({ ...current, iconName: event.target.value }))} className={inputCls}>
          {ICON_OPTIONS.map((name) => <option key={name}>{name}</option>)}
        </select>
      </Field>
      <Field label={t("cms.field.preview")}>
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${form.bg}`}><Icon className={`h-6 w-6 ${form.color}`} /></div>
      </Field>
      <Field label={t("cms.field.color")} full>
        <div className="flex flex-wrap gap-2">
          {SPECIALTY_COLORS.map((color) => (
            <button key={color.label} type="button" onClick={() => setForm((current) => ({ ...current, color: color.text, bg: color.bg }))} title={color.label} className={`h-8 w-8 rounded-full ${color.dot} transition-smooth ${form.color === color.text ? "ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`} />
          ))}
        </div>
      </Field>
      <Field label={t("cms.field.visibility")}><StatusToggle active={form.active} onToggle={() => setForm((current) => ({ ...current, active: !current.active }))} /></Field>
    </SimpleFormModal>
  );
}

function PartnersSection() {
  const { t } = useI18n();
  const { partners, addPartner, updatePartner, deletePartner } = useCms();
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);

  return (
    <>
      <SectionHeader title={t("cms.partners.summary", { total: partners.length, active: partners.filter((item) => item.active).length })} addLabel={t("cms.partners.new")} onAdd={() => setEditing("new")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {partners.map((item) => (
          <EditableCard key={item.id} active={item.active} onToggle={() => updatePartner(item.id, { active: !item.active })} onEdit={() => setEditing(item)} onDelete={() => setDeleteTarget(item)}>
            <div className="mb-3 h-14 flex items-center">
              {item.logoUrl ? <img src={item.logoUrl} alt={item.name} className="max-h-12 max-w-[180px] object-contain" /> : <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Handshake className="h-5 w-5" /></span>}
            </div>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            {item.websiteUrl && <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Globe className="h-3 w-3" /> {item.websiteUrl}</a>}
          </EditableCard>
        ))}
      </div>
      {editing && <PartnerModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={(data, id) => { id ? updatePartner(id, data) : addPartner(data); setEditing(null); }} />}
      {deleteTarget && <ConfirmModal title={t("cms.partners.deleteTitle")} label={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={() => { deletePartner(deleteTarget.id); setDeleteTarget(null); }} />}
    </>
  );
}

function PartnerModal({ item, onClose, onSave }: { item: Partner | null; onClose: () => void; onSave: (data: Omit<Partner, "id">, id?: number) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<Partner, "id">>(item ? { name: item.name, logoUrl: item.logoUrl, websiteUrl: item.websiteUrl, description: item.description, active: item.active } : { name: "", logoUrl: "", websiteUrl: "", description: "", active: true });
  return (
    <SimpleFormModal title={item ? t("cms.partners.editTitle") : t("cms.partners.new")} onClose={onClose} onSubmit={() => onSave(form, item?.id)} disabled={!form.name.trim()}>
      <Field label={t("cms.partners.name")} full><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputCls} /></Field>
      <Field label={t("cms.partners.logo")} full>
        <input value={form.logoUrl} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="https://..." className={inputCls} />
        {form.logoUrl && <img src={form.logoUrl} alt="" className="mt-2 h-16 rounded-xl border border-border bg-background object-contain p-2" />}
      </Field>
      <Field label={t("cms.partners.website")} full><input value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://..." className={inputCls} /></Field>
      <Field label={t("cms.field.description")} full><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} className={inputCls} /></Field>
      <Field label={t("cms.field.visibility")}><StatusToggle active={form.active} onToggle={() => setForm((current) => ({ ...current, active: !current.active }))} /></Field>
    </SimpleFormModal>
  );
}

function FeaturesSection() {
  const { t } = useI18n();
  const { whyFeatures, addWhyFeature, updateWhyFeature, deleteWhyFeature } = useCms();
  const [editing, setEditing] = useState<WhyFeature | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhyFeature | null>(null);

  return (
    <>
      <SectionHeader title={t("cms.features.summary", { total: whyFeatures.length, active: whyFeatures.filter((item) => item.active).length })} addLabel={t("cms.features.new")} onAdd={() => setEditing("new")} />
      <p className="-mt-3 text-xs text-muted-foreground">{t("cms.features.help")}</p>
      <div className="space-y-3">
        {whyFeatures.map((item) => {
          const Icon = ICON_MAP[item.iconName] ?? Lightbulb;
          return (
            <EditableCard key={item.id} active={item.active} horizontal onToggle={() => updateWhyFeature(item.id, { active: !item.active })} onEdit={() => setEditing(item)} onDelete={() => setDeleteTarget(item)}>
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-white shadow-card shrink-0`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            </EditableCard>
          );
        })}
      </div>
      {editing && <FeatureModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={(data, id) => { id ? updateWhyFeature(id, data) : addWhyFeature(data); setEditing(null); }} />}
      {deleteTarget && <ConfirmModal title={t("cms.features.deleteTitle")} label={deleteTarget.title} onClose={() => setDeleteTarget(null)} onConfirm={() => { deleteWhyFeature(deleteTarget.id); setDeleteTarget(null); }} />}
    </>
  );
}

function FeatureModal({ item, onClose, onSave }: { item: WhyFeature | null; onClose: () => void; onSave: (data: Omit<WhyFeature, "id">, id?: number) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<WhyFeature, "id">>(item ? { iconName: item.iconName, gradient: item.gradient, title: item.title, text: item.text, active: item.active } : { iconName: "Lightbulb", gradient: "from-blue-600 to-blue-400", title: "", text: "", active: true });
  const Icon = ICON_MAP[form.iconName] ?? Lightbulb;
  return (
    <SimpleFormModal title={item ? t("cms.features.editTitle") : t("cms.features.new")} onClose={onClose} onSubmit={() => onSave(form, item?.id)} disabled={!form.title.trim()}>
      <Field label={t("cms.postModal.title")} full><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputCls} /></Field>
      <Field label={t("cms.field.description")} full><textarea value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} rows={3} className={inputCls} /></Field>
      <Field label={t("cms.field.icon")}>
        <select value={form.iconName} onChange={(event) => setForm((current) => ({ ...current, iconName: event.target.value }))} className={inputCls}>
          {ICON_OPTIONS.map((name) => <option key={name}>{name}</option>)}
        </select>
      </Field>
      <Field label={t("cms.field.preview")}>
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${form.gradient} text-white`}><Icon className="h-6 w-6" /></div>
      </Field>
      <Field label={t("cms.features.gradientColor")} full>
        <div className="flex flex-wrap gap-2">
          {GRADIENTS.map((gradient) => (
            <button key={gradient} type="button" onClick={() => setForm((current) => ({ ...current, gradient }))} className={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} transition-smooth ${form.gradient === gradient ? "ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`} />
          ))}
        </div>
      </Field>
      <Field label={t("cms.field.visibility")}><StatusToggle active={form.active} onToggle={() => setForm((current) => ({ ...current, active: !current.active }))} /></Field>
    </SimpleFormModal>
  );
}

function SectionHeader({ title, addLabel, onAdd }: { title: string; addLabel: string; onAdd: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{title}</p>
      <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90">
        <FilePlus2 className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}

function EditableCard({
  active,
  onToggle,
  onEdit,
  onDelete,
  children,
  horizontal = false,
}: {
  active: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
  horizontal?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-card transition-smooth ${active ? "" : "opacity-65"}`}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <StatusToggle active={active} onToggle={onToggle} />
        <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
          <Edit2 className="h-3 w-3" /> {t("common.edit")}
        </button>
        <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-md bg-critical px-2.5 py-1.5 text-xs font-semibold text-critical-foreground hover:bg-critical/90">
          <Trash2 className="h-3 w-3" /> {t("common.delete")}
        </button>
      </div>
      <div className={horizontal ? "flex flex-wrap items-start gap-4" : ""}>{children}</div>
    </div>
  );
}

function SimpleFormModal({
  title,
  onClose,
  onSubmit,
  disabled,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <CdssModal title={title} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={disabled} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {t("common.save")}
          </button>
        </div>
      </form>
    </CdssModal>
  );
}

function ConfirmModal({ title, label, onConfirm, onClose }: { title: string; label: string; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <CdssModal title={title} onClose={onClose} maxWidth="sm:max-w-md">
      <p className="text-sm text-muted-foreground">{t("cms.confirmDelete", { label })}</p>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button onClick={onClose} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">
          {t("common.cancel")}
        </button>
        <button onClick={onConfirm} className="rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-critical-foreground hover:bg-critical/90">
          {t("common.delete")}
        </button>
      </div>
    </CdssModal>
  );
}
