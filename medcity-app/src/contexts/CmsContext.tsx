import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createCmsPartner,
  createCmsPost,
  createCmsSpecialty,
  createCmsTestimonial,
  createCmsWhyFeature,
  deleteCmsPartner,
  deleteCmsPost,
  deleteCmsSpecialty,
  deleteCmsTestimonial,
  deleteCmsWhyFeature,
  getPublicCmsHome,
  listCmsPartners,
  listCmsPosts,
  listCmsSpecialties,
  listCmsTestimonials,
  listCmsWhyFeatures,
  updateCmsPartner,
  updateCmsPost,
  updateCmsSpecialty,
  updateCmsTestimonial,
  updateCmsWhyFeature,
  type ApiCmsPartner,
  type ApiCmsPost,
  type ApiCmsSpecialty,
  type ApiCmsTestimonial,
  type ApiCmsWhyFeature,
} from "@/lib/backend-api";

export type PostStatus = "publi\u00e9" | "brouillon" | "archiv\u00e9";
export type PostCategory =
  | "Actualit\u00e9"
  | "M\u00e9decine"
  | "M\u00e9dicaments"
  | "Conseils"
  | "Recherche"
  | "Technologie"
  | "Esth\u00e9tique"
  | "Neurologie"
  | "Cardiologie"
  | "Sant\u00e9 Num\u00e9rique";

export type Post = {
  id: string | number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: PostCategory;
  tags: string[];
  author: string;
  imageUrl: string;
  coverColor: string;
  status: PostStatus;
  featured: boolean;
  publishedAt: string;
  updatedAt: string;
  scheduledDate: string;
  views: number;
  readTime: number;
  commentsCount: number;
  metaTitle: string;
  metaDescription: string;
};

export type Testimonial = {
  id: string | number;
  name: string;
  role: string;
  text: string;
  rating: number;
  active: boolean;
};

export type Partner = {
  id: string | number;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  active: boolean;
};

export type Specialty = {
  id: string | number;
  name: string;
  description: string;
  iconName: string;
  color: string;
  bg: string;
  query: string;
  active: boolean;
};

export type WhyFeature = {
  id: string | number;
  iconName: string;
  gradient: string;
  title: string;
  text: string;
  active: boolean;
};

export const POST_CATEGORIES: PostCategory[] = [
  "Actualit\u00e9",
  "M\u00e9decine",
  "M\u00e9dicaments",
  "Conseils",
  "Recherche",
  "Technologie",
  "Esth\u00e9tique",
  "Neurologie",
  "Cardiologie",
  "Sant\u00e9 Num\u00e9rique",
];

export function calcReadTime(content: string): number {
  return Math.max(1, Math.round(content.trim().split(/\s+/).filter(Boolean).length / 200));
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const INITIAL_POSTS: Post[] = [
  {
    id: 1,
    title: "5 habitudes anti-Ã¢ge pour ralentir le vieillissement",
    slug: "5-habitudes-anti-age-ralentir-vieillissement",
    excerpt: "Pas besoin de chirurgie ou de traitements lourds. La beautÃ© naturelle repose sur des habitudes simples que vous pouvez adopter au quotidien.",
    content: "La peau est le premier rempart de notre organisme. Son vieillissement est influencÃ© Ã  20 % par la gÃ©nÃ©tique et Ã  80 % par les habitudes de vie. Parmi les gestes les plus efficaces : l'hydratation rÃ©guliÃ¨re, l'application quotidienne d'un SPF 50, une alimentation riche en antioxydants, un sommeil rÃ©parateur et l'arrÃªt du tabac.",
    category: "Esth\u00e9tique",
    tags: ["anti-Ã¢ge", "peau", "beautÃ©", "SPF"],
    author: "MedCity",
    imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80",
    coverColor: "from-pink-500 to-rose-600",
    status: "publi\u00e9",
    featured: true,
    publishedAt: "21 avril 2025",
    updatedAt: "21 avril 2025",
    scheduledDate: "",
    views: 5840,
    readTime: 5,
    commentsCount: 12,
    metaTitle: "5 habitudes anti-Ã¢ge | MedCity",
    metaDescription: "5 gestes simples pour prÃ©server la jeunesse de votre peau.",
  },
  {
    id: 2,
    title: "La tÃ©lÃ©consultation : avenir de la mÃ©decine en Tunisie",
    slug: "teleconsultation-avenir-medecine-tunisie",
    excerpt: "La consultation mÃ©dicale en ligne devient une rÃ©alitÃ© en Tunisie. DÃ©couvrez comment MedCity transforme l'accÃ¨s aux soins.",
    content: "La tÃ©lÃ©mÃ©decine a connu une accÃ©lÃ©ration forte en Tunisie. GrÃ¢ce aux plateformes numÃ©riques, les patients des zones Ã©loignÃ©es peuvent consulter des spÃ©cialistes sans se dÃ©placer. MedCity accompagne cette transformation avec des outils de recherche, de coordination et de suivi clinique.",
    category: "Sant\u00e9 Num\u00e9rique",
    tags: ["tÃ©lÃ©mÃ©decine", "numÃ©rique", "Tunisie"],
    author: "MedCity",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80",
    coverColor: "from-cyan-500 to-cyan-600",
    status: "publi\u00e9",
    featured: false,
    publishedAt: "10 avril 2025",
    updatedAt: "10 avril 2025",
    scheduledDate: "",
    views: 4210,
    readTime: 7,
    commentsCount: 8,
    metaTitle: "TÃ©lÃ©consultation en Tunisie | MedCity",
    metaDescription: "Bilan et perspectives de la mÃ©decine en ligne en Tunisie.",
  },
  {
    id: 3,
    title: "Mise Ã  jour de la liste nationale des mÃ©dicaments 2025",
    slug: "mise-a-jour-liste-nationale-medicaments-2025",
    excerpt: "47 nouvelles spÃ©cialitÃ©s thÃ©rapeutiques intÃ©grÃ©es Ã  la liste nationale des mÃ©dicaments remboursables.",
    content: "La Direction GÃ©nÃ©rale de la Pharmacie a publiÃ© une mise Ã  jour incluant de nouvelles spÃ©cialitÃ©s thÃ©rapeutiques. MedCity intÃ¨gre ces donnÃ©es dans sa base mÃ©dicamenteuse pour aider les professionnels Ã  vÃ©rifier les informations essentielles.",
    category: "M\u00e9dicaments",
    tags: ["mÃ©dicaments", "CNAM", "2025"],
    author: "Dr. Amira Khelil",
    imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80",
    coverColor: "from-blue-500 to-blue-600",
    status: "publi\u00e9",
    featured: true,
    publishedAt: "12 mai 2025",
    updatedAt: "12 mai 2025",
    scheduledDate: "",
    views: 4820,
    readTime: 5,
    commentsCount: 9,
    metaTitle: "Liste mÃ©dicaments remboursÃ©s Tunisie 2025 | MedCity",
    metaDescription: "Nouvelles spÃ©cialitÃ©s intÃ©grÃ©es Ã  la liste nationale 2025.",
  },
  {
    id: 4,
    title: "TÃ©lÃ©mÃ©decine : bilan un an aprÃ¨s la loi de cadrage",
    slug: "bilan-loi-cadrage-telemedecine-tunisie",
    excerpt: "Un an aprÃ¨s l'adoption du cadre rÃ©glementaire, oÃ¹ en est la tÃ©lÃ©mÃ©decine en Tunisie ?",
    content: "Douze mois aprÃ¨s le dÃ©cret, l'adoption progresse mais reste inÃ©gale selon les rÃ©gions et les spÃ©cialitÃ©s. Les plateformes doivent encore amÃ©liorer l'interopÃ©rabilitÃ© et la confiance des patients.",
    category: "Actualit\u00e9",
    tags: ["tÃ©lÃ©mÃ©decine", "loi", "CNAM"],
    author: "RÃ©daction MedCity",
    imageUrl: "https://images.unsplash.com/photo-1504439468489-c8920d796a29?w=800&q=80",
    coverColor: "from-teal-500 to-teal-600",
    status: "brouillon",
    featured: false,
    publishedAt: "",
    updatedAt: "7 mai 2025",
    scheduledDate: "2025-06-01",
    views: 0,
    readTime: 5,
    commentsCount: 0,
    metaTitle: "Bilan tÃ©lÃ©mÃ©decine Tunisie 2025 | MedCity",
    metaDescription: "Un an aprÃ¨s la loi de cadrage, bilan de la tÃ©lÃ©mÃ©decine en Tunisie.",
  },
];

const INITIAL_TESTIMONIALS: Testimonial[] = [
  { id: 1, name: "Dr. Samar Ben Ali", role: "Chirurgienne Plasticienne", rating: 5, active: true, text: "Simple Ã  utiliser, intuitive et parfaitement adaptÃ©e Ã  ma pratique quotidienne." },
  { id: 2, name: "Dr. Khaled Mansour", role: "MÃ©decin GÃ©nÃ©raliste", rating: 5, active: true, text: "Navigation intuitive, design agrÃ©able et informations claires pour les praticiens." },
  { id: 3, name: "Dr. Fatima Zahra", role: "Neurologue", rating: 5, active: true, text: "La recherche d'articles scientifiques est rapide, prÃ©cise et trÃ¨s bien adaptÃ©e." },
];

const INITIAL_PARTNERS: Partner[] = [
  { id: 1, name: "Pharmaghreb", logoUrl: "https://medcity.tn/wp-content/uploads/2025/04/Pharmaghreb-e1745837900416-1024x300.webp", websiteUrl: "https://pharmaghreb.com", description: "Distributeur pharmaceutique leader en Afrique du Nord", active: true },
  { id: 2, name: "Pharmacie Centrale de Tunisie", logoUrl: "", websiteUrl: "https://pct.tn", description: "Organisme public de rÃ©fÃ©rencement et de distribution du mÃ©dicament en Tunisie", active: true },
];

const INITIAL_SPECIALTIES: Specialty[] = [
  { id: 1, name: "Pneumologie", description: "Diagnostic, traitement et prÃ©vention des maladies respiratoires.", iconName: "Wind", color: "text-blue-500", bg: "bg-blue-500/10", query: "pneumology respiratory diseases", active: true },
  { id: 2, name: "Neurologie", description: "Troubles du systÃ¨me nerveux, migraine, SEP et pathologies complexes.", iconName: "Brain", color: "text-purple-500", bg: "bg-purple-500/10", query: "neurology nervous system", active: true },
  { id: 3, name: "OrthopÃ©die", description: "Troubles du systÃ¨me musculo-squelettique, traumatologie et chirurgie articulaire.", iconName: "Bone", color: "text-amber-500", bg: "bg-amber-500/10", query: "orthopedics musculoskeletal", active: true },
  { id: 4, name: "Cardiologie", description: "Maladies du coeur, hypertension et prÃ©vention cardiovasculaire.", iconName: "Heart", color: "text-red-500", bg: "bg-red-500/10", query: "cardiology cardiovascular", active: true },
  { id: 5, name: "Soins Infirmiers", description: "Services infirmiers et suivi appropriÃ© via consultations virtuelles.", iconName: "Syringe", color: "text-green-500", bg: "bg-green-500/10", query: "nursing care virtual consultations", active: true },
  { id: 6, name: "Chirurgie EsthÃ©tique", description: "Techniques avancÃ©es, suivi post-opÃ©ratoire et chirurgie reconstructrice.", iconName: "Star", color: "text-pink-500", bg: "bg-pink-500/10", query: "plastic surgery aesthetics", active: true },
];

const INITIAL_WHY_FEATURES: WhyFeature[] = [
  { id: 1, iconName: "Network", gradient: "from-blue-600 to-blue-400", title: "Connexion patients & professionnels", text: "Notre plateforme facilite la gestion des soins mÃ©dicaux en connectant patients et professionnels de santÃ© de maniÃ¨re intuitive et efficace.", active: true },
  { id: 2, iconName: "LayoutDashboard", gradient: "from-violet-600 to-violet-400", title: "Organisation simplifiÃ©e des soins", text: "Une solution qui simplifie la prise de rendez-vous, la gestion des dossiers patients et l'accÃ¨s Ã  un rÃ©seau de mÃ©decins.", active: true },
  { id: 3, iconName: "Lightbulb", gradient: "from-cyan-600 to-cyan-400", title: "Outils IA & aide au diagnostic", text: "Un espace centralisÃ© pour optimiser la pratique et accÃ©der Ã  des outils d'aide au diagnostic basÃ©s sur l'IA.", active: true },
];

type CmsContextValue = {
  loading: boolean;
  posts: Post[];
  addPost: (post: Omit<Post, "id" | "views" | "commentsCount" | "publishedAt" | "updatedAt">) => void;
  updatePost: (id: Post["id"], data: Partial<Post>) => void;
  deletePost: (id: Post["id"]) => void;
  testimonials: Testimonial[];
  addTestimonial: (testimonial: Omit<Testimonial, "id">) => void;
  updateTestimonial: (id: Testimonial["id"], data: Partial<Testimonial>) => void;
  deleteTestimonial: (id: Testimonial["id"]) => void;
  partners: Partner[];
  addPartner: (partner: Omit<Partner, "id">) => void;
  updatePartner: (id: Partner["id"], data: Partial<Partner>) => void;
  deletePartner: (id: Partner["id"]) => void;
  specialties: Specialty[];
  addSpecialty: (specialty: Omit<Specialty, "id">) => void;
  updateSpecialty: (id: Specialty["id"], data: Partial<Specialty>) => void;
  deleteSpecialty: (id: Specialty["id"]) => void;
  whyFeatures: WhyFeature[];
  addWhyFeature: (feature: Omit<WhyFeature, "id">) => void;
  updateWhyFeature: (id: WhyFeature["id"], data: Partial<WhyFeature>) => void;
  deleteWhyFeature: (id: WhyFeature["id"]) => void;
};

const CmsContext = createContext<CmsContextValue | null>(null);
const STATUS_PUBLISHED = "publi\u00e9" as PostStatus;
const STATUS_ARCHIVED = "archiv\u00e9" as PostStatus;

const statusFromApi = (status: ApiCmsPost["status"]): PostStatus =>
  status === "published" ? STATUS_PUBLISHED : status === "archived" ? STATUS_ARCHIVED : "brouillon";

const statusToApi = (status?: PostStatus): ApiCmsPost["status"] | undefined =>
  status === STATUS_PUBLISHED ? "published" : status === STATUS_ARCHIVED ? "archived" : status === "brouillon" ? "draft" : undefined;

function apiDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-TN", { day: "numeric", month: "short", year: "numeric" });
}

function mapPost(post: ApiCmsPost): Post {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category as PostCategory,
    tags: post.tags ?? [],
    author: post.author,
    imageUrl: post.imageUrl ?? "",
    coverColor: post.coverColor ?? "from-blue-500 to-blue-600",
    status: statusFromApi(post.status),
    featured: post.featured,
    publishedAt: apiDate(post.publishedAt),
    updatedAt: apiDate(post.updatedAt),
    scheduledDate: post.scheduledDate?.slice(0, 10) ?? "",
    views: post.views ?? 0,
    readTime: post.readTime ?? calcReadTime(post.content),
    commentsCount: post.commentsCount ?? 0,
    metaTitle: post.metaTitle ?? "",
    metaDescription: post.metaDescription ?? "",
  };
}

function mapPostPayload(post: Partial<Post>): Partial<ApiCmsPost> {
  return {
    ...post,
    id: undefined,
    category: post.category,
    status: statusToApi(post.status),
    scheduledDate: post.scheduledDate || undefined,
    publishedAt: post.status === STATUS_PUBLISHED ? new Date().toISOString() : undefined,
  };
}

function mapTestimonial(item: ApiCmsTestimonial): Testimonial {
  return item;
}

function mapPartner(item: ApiCmsPartner): Partner {
  return { ...item, websiteUrl: item.websiteUrl ?? "", description: item.description ?? "" };
}

function mapSpecialty(item: ApiCmsSpecialty): Specialty {
  return { ...item, iconName: item.iconName ?? "Stethoscope", color: item.color ?? "text-primary", bg: item.bg ?? "bg-primary-soft", query: item.query ?? "" };
}

function mapWhyFeature(item: ApiCmsWhyFeature): WhyFeature {
  return item;
}

function withoutId<T extends { id?: unknown }>(data: T): Omit<T, "id"> {
  const { id: _id, ...rest } = data;
  return rest;
}

export function CmsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [whyFeatures, setWhyFeatures] = useState<WhyFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const now = () => new Date().toLocaleDateString("fr-TN", { day: "numeric", month: "short", year: "numeric" });

  const refreshCms = async () => {
    setLoading(true);
    try {
      const token = window.localStorage.getItem("medcity-auth-token");
      const isAdmin = token && JSON.parse(atob(token.split(".")[1] ?? "")).role === "admin";
      const [apiPosts, apiTestimonials, apiPartners, apiSpecialties, apiWhyFeatures] = isAdmin
        ? await Promise.all([
            listCmsPosts(),
            listCmsTestimonials(),
            listCmsPartners(),
            listCmsSpecialties(),
            listCmsWhyFeatures(),
          ])
        : await getPublicCmsHome().then((home) => [
            home.posts,
            home.testimonials,
            home.partners,
            home.specialties,
            home.whyFeatures,
          ] as const);
      setPosts(apiPosts.map(mapPost));
      setTestimonials(apiTestimonials.map(mapTestimonial));
      setPartners(apiPartners.map(mapPartner));
      setSpecialties(apiSpecialties.map(mapSpecialty));
      setWhyFeatures(apiWhyFeatures.map(mapWhyFeature));
    } catch {
      setPosts(INITIAL_POSTS);
      setTestimonials(INITIAL_TESTIMONIALS);
      setPartners(INITIAL_PARTNERS);
      setSpecialties(INITIAL_SPECIALTIES);
      setWhyFeatures(INITIAL_WHY_FEATURES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshCms();
  }, []);

  const addPost: CmsContextValue["addPost"] = (data) => {
    void (async () => {
      const created = await createCmsPost({
        ...mapPostPayload(data),
        views: 0,
        commentsCount: 0,
        readTime: data.readTime,
      });
      setPosts((prev) => [mapPost(created), ...prev.filter((post) => post.id !== created.id)]);
    })();
    setPosts((prev) => [
      {
        ...data,
        id: Date.now(),
        views: 0,
        commentsCount: 0,
        publishedAt: data.status === "publi\u00e9" ? now() : "",
        updatedAt: now(),
      },
      ...prev,
    ]);
  };

  const updatePost: CmsContextValue["updatePost"] = (id, data) => {
    void (async () => {
      if (typeof id === "string") {
        const updated = await updateCmsPost(id, mapPostPayload(data));
        setPosts((prev) => prev.map((post) => (post.id === id ? mapPost(updated) : post)));
      }
    })();
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? {
              ...post,
              ...data,
              updatedAt: now(),
              publishedAt: data.status === "publi\u00e9" && !post.publishedAt ? now() : data.publishedAt ?? post.publishedAt,
            }
          : post,
      ),
    );
  };

  const deletePost = (id: Post["id"]) => {
    void (async () => { if (typeof id === "string") await deleteCmsPost(id); })();
    setPosts((prev) => prev.filter((post) => post.id !== id));
  };
  const addTestimonial = (testimonial: Omit<Testimonial, "id">) => {
    void (async () => {
      const created = mapTestimonial(await createCmsTestimonial(testimonial));
      setTestimonials((prev) => [...prev.filter((item) => typeof item.id === "string"), created]);
    })();
    setTestimonials((prev) => [...prev, { ...testimonial, id: Date.now() }]);
  };
  const updateTestimonial = (id: Testimonial["id"], data: Partial<Testimonial>) => {
    void (async () => {
      if (typeof id === "string") {
        const updated = mapTestimonial(await updateCmsTestimonial(id, withoutId(data)));
        setTestimonials((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
    })();
    setTestimonials((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };
  const deleteTestimonial = (id: Testimonial["id"]) => {
    void (async () => { if (typeof id === "string") await deleteCmsTestimonial(id); })();
    setTestimonials((prev) => prev.filter((item) => item.id !== id));
  };
  const addPartner = (partner: Omit<Partner, "id">) => {
    void (async () => {
      const created = mapPartner(await createCmsPartner(partner));
      setPartners((prev) => [...prev.filter((item) => typeof item.id === "string"), created]);
    })();
    setPartners((prev) => [...prev, { ...partner, id: Date.now() }]);
  };
  const updatePartner = (id: Partner["id"], data: Partial<Partner>) => {
    void (async () => {
      if (typeof id === "string") {
        const updated = mapPartner(await updateCmsPartner(id, withoutId(data)));
        setPartners((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
    })();
    setPartners((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };
  const deletePartner = (id: Partner["id"]) => {
    void (async () => { if (typeof id === "string") await deleteCmsPartner(id); })();
    setPartners((prev) => prev.filter((item) => item.id !== id));
  };
  const addSpecialty = (specialty: Omit<Specialty, "id">) => {
    void (async () => {
      const created = mapSpecialty(await createCmsSpecialty(specialty));
      setSpecialties((prev) => [...prev.filter((item) => typeof item.id === "string"), created]);
    })();
    setSpecialties((prev) => [...prev, { ...specialty, id: Date.now() }]);
  };
  const updateSpecialty = (id: Specialty["id"], data: Partial<Specialty>) => {
    void (async () => {
      if (typeof id === "string") {
        const updated = mapSpecialty(await updateCmsSpecialty(id, withoutId(data)));
        setSpecialties((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
    })();
    setSpecialties((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };
  const deleteSpecialty = (id: Specialty["id"]) => {
    void (async () => { if (typeof id === "string") await deleteCmsSpecialty(id); })();
    setSpecialties((prev) => prev.filter((item) => item.id !== id));
  };
  const addWhyFeature = (feature: Omit<WhyFeature, "id">) => {
    void (async () => {
      const created = mapWhyFeature(await createCmsWhyFeature(feature));
      setWhyFeatures((prev) => [...prev.filter((item) => typeof item.id === "string"), created]);
    })();
    setWhyFeatures((prev) => [...prev, { ...feature, id: Date.now() }]);
  };
  const updateWhyFeature = (id: WhyFeature["id"], data: Partial<WhyFeature>) => {
    void (async () => {
      if (typeof id === "string") {
        const updated = mapWhyFeature(await updateCmsWhyFeature(id, withoutId(data)));
        setWhyFeatures((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
    })();
    setWhyFeatures((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };
  const deleteWhyFeature = (id: WhyFeature["id"]) => {
    void (async () => { if (typeof id === "string") await deleteCmsWhyFeature(id); })();
    setWhyFeatures((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <CmsContext.Provider
      value={{
        loading,
        posts,
        addPost,
        updatePost,
        deletePost,
        testimonials,
        addTestimonial,
        updateTestimonial,
        deleteTestimonial,
        partners,
        addPartner,
        updatePartner,
        deletePartner,
        specialties,
        addSpecialty,
        updateSpecialty,
        deleteSpecialty,
        whyFeatures,
        addWhyFeature,
        updateWhyFeature,
        deleteWhyFeature,
      }}
    >
      {children}
    </CmsContext.Provider>
  );
}

export function useCms() {
  const context = useContext(CmsContext);
  if (!context) throw new Error("useCms must be used inside CmsProvider");
  return context;
}
