import { createContext, useContext, useState, type ReactNode } from "react";

export type PostStatus = "publié" | "brouillon" | "archivé";
export type PostCategory =
  | "Actualité"
  | "Médecine"
  | "Médicaments"
  | "Conseils"
  | "Recherche"
  | "Technologie"
  | "Esthétique"
  | "Neurologie"
  | "Cardiologie"
  | "Santé Numérique";

export type Post = {
  id: number;
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
  id: number;
  name: string;
  role: string;
  text: string;
  rating: number;
  active: boolean;
};

export type Partner = {
  id: number;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  active: boolean;
};

export type Specialty = {
  id: number;
  name: string;
  description: string;
  iconName: string;
  color: string;
  bg: string;
  query: string;
  active: boolean;
};

export type WhyFeature = {
  id: number;
  iconName: string;
  gradient: string;
  title: string;
  text: string;
  active: boolean;
};

export const POST_CATEGORIES: PostCategory[] = [
  "Actualité",
  "Médecine",
  "Médicaments",
  "Conseils",
  "Recherche",
  "Technologie",
  "Esthétique",
  "Neurologie",
  "Cardiologie",
  "Santé Numérique",
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
    title: "5 habitudes anti-âge pour ralentir le vieillissement",
    slug: "5-habitudes-anti-age-ralentir-vieillissement",
    excerpt: "Pas besoin de chirurgie ou de traitements lourds. La beauté naturelle repose sur des habitudes simples que vous pouvez adopter au quotidien.",
    content: "La peau est le premier rempart de notre organisme. Son vieillissement est influencé à 20 % par la génétique et à 80 % par les habitudes de vie. Parmi les gestes les plus efficaces : l'hydratation régulière, l'application quotidienne d'un SPF 50, une alimentation riche en antioxydants, un sommeil réparateur et l'arrêt du tabac.",
    category: "Esthétique",
    tags: ["anti-âge", "peau", "beauté", "SPF"],
    author: "MedCity",
    imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80",
    coverColor: "from-pink-500 to-rose-600",
    status: "publié",
    featured: true,
    publishedAt: "21 avril 2025",
    updatedAt: "21 avril 2025",
    scheduledDate: "",
    views: 5840,
    readTime: 5,
    commentsCount: 12,
    metaTitle: "5 habitudes anti-âge | MedCity",
    metaDescription: "5 gestes simples pour préserver la jeunesse de votre peau.",
  },
  {
    id: 2,
    title: "La téléconsultation : avenir de la médecine en Tunisie",
    slug: "teleconsultation-avenir-medecine-tunisie",
    excerpt: "La consultation médicale en ligne devient une réalité en Tunisie. Découvrez comment MedCity transforme l'accès aux soins.",
    content: "La télémédecine a connu une accélération forte en Tunisie. Grâce aux plateformes numériques, les patients des zones éloignées peuvent consulter des spécialistes sans se déplacer. MedCity accompagne cette transformation avec des outils de recherche, de coordination et de suivi clinique.",
    category: "Santé Numérique",
    tags: ["télémédecine", "numérique", "Tunisie"],
    author: "MedCity",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80",
    coverColor: "from-cyan-500 to-cyan-600",
    status: "publié",
    featured: false,
    publishedAt: "10 avril 2025",
    updatedAt: "10 avril 2025",
    scheduledDate: "",
    views: 4210,
    readTime: 7,
    commentsCount: 8,
    metaTitle: "Téléconsultation en Tunisie | MedCity",
    metaDescription: "Bilan et perspectives de la médecine en ligne en Tunisie.",
  },
  {
    id: 3,
    title: "Mise à jour de la liste nationale des médicaments 2025",
    slug: "mise-a-jour-liste-nationale-medicaments-2025",
    excerpt: "47 nouvelles spécialités thérapeutiques intégrées à la liste nationale des médicaments remboursables.",
    content: "La Direction Générale de la Pharmacie a publié une mise à jour incluant de nouvelles spécialités thérapeutiques. MedCity intègre ces données dans sa base médicamenteuse pour aider les professionnels à vérifier les informations essentielles.",
    category: "Médicaments",
    tags: ["médicaments", "CNAM", "2025"],
    author: "Dr. Amira Khelil",
    imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80",
    coverColor: "from-blue-500 to-blue-600",
    status: "publié",
    featured: true,
    publishedAt: "12 mai 2025",
    updatedAt: "12 mai 2025",
    scheduledDate: "",
    views: 4820,
    readTime: 5,
    commentsCount: 9,
    metaTitle: "Liste médicaments remboursés Tunisie 2025 | MedCity",
    metaDescription: "Nouvelles spécialités intégrées à la liste nationale 2025.",
  },
  {
    id: 4,
    title: "Télémédecine : bilan un an après la loi de cadrage",
    slug: "bilan-loi-cadrage-telemedecine-tunisie",
    excerpt: "Un an après l'adoption du cadre réglementaire, où en est la télémédecine en Tunisie ?",
    content: "Douze mois après le décret, l'adoption progresse mais reste inégale selon les régions et les spécialités. Les plateformes doivent encore améliorer l'interopérabilité et la confiance des patients.",
    category: "Actualité",
    tags: ["télémédecine", "loi", "CNAM"],
    author: "Rédaction MedCity",
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
    metaTitle: "Bilan télémédecine Tunisie 2025 | MedCity",
    metaDescription: "Un an après la loi de cadrage, bilan de la télémédecine en Tunisie.",
  },
];

const INITIAL_TESTIMONIALS: Testimonial[] = [
  { id: 1, name: "Dr. Samar Ben Ali", role: "Chirurgienne Plasticienne", rating: 5, active: true, text: "Simple à utiliser, intuitive et parfaitement adaptée à ma pratique quotidienne." },
  { id: 2, name: "Dr. Khaled Mansour", role: "Médecin Généraliste", rating: 5, active: true, text: "Navigation intuitive, design agréable et informations claires pour les praticiens." },
  { id: 3, name: "Dr. Fatima Zahra", role: "Neurologue", rating: 5, active: true, text: "La recherche d'articles scientifiques est rapide, précise et très bien adaptée." },
];

const INITIAL_PARTNERS: Partner[] = [
  { id: 1, name: "Pharmaghreb", logoUrl: "https://medcity.tn/wp-content/uploads/2025/04/Pharmaghreb-e1745837900416-1024x300.webp", websiteUrl: "https://pharmaghreb.com", description: "Distributeur pharmaceutique leader en Afrique du Nord", active: true },
  { id: 2, name: "Pharmacie Centrale de Tunisie", logoUrl: "", websiteUrl: "https://pct.tn", description: "Organisme public de référencement et de distribution du médicament en Tunisie", active: true },
];

const INITIAL_SPECIALTIES: Specialty[] = [
  { id: 1, name: "Pneumologie", description: "Diagnostic, traitement et prévention des maladies respiratoires.", iconName: "Wind", color: "text-blue-500", bg: "bg-blue-500/10", query: "pneumology respiratory diseases", active: true },
  { id: 2, name: "Neurologie", description: "Troubles du système nerveux, migraine, SEP et pathologies complexes.", iconName: "Brain", color: "text-purple-500", bg: "bg-purple-500/10", query: "neurology nervous system", active: true },
  { id: 3, name: "Orthopédie", description: "Troubles du système musculo-squelettique, traumatologie et chirurgie articulaire.", iconName: "Bone", color: "text-amber-500", bg: "bg-amber-500/10", query: "orthopedics musculoskeletal", active: true },
  { id: 4, name: "Cardiologie", description: "Maladies du coeur, hypertension et prévention cardiovasculaire.", iconName: "Heart", color: "text-red-500", bg: "bg-red-500/10", query: "cardiology cardiovascular", active: true },
  { id: 5, name: "Soins Infirmiers", description: "Services infirmiers et suivi approprié via consultations virtuelles.", iconName: "Syringe", color: "text-green-500", bg: "bg-green-500/10", query: "nursing care virtual consultations", active: true },
  { id: 6, name: "Chirurgie Esthétique", description: "Techniques avancées, suivi post-opératoire et chirurgie reconstructrice.", iconName: "Star", color: "text-pink-500", bg: "bg-pink-500/10", query: "plastic surgery aesthetics", active: true },
];

const INITIAL_WHY_FEATURES: WhyFeature[] = [
  { id: 1, iconName: "Network", gradient: "from-blue-600 to-blue-400", title: "Connexion patients & professionnels", text: "Notre plateforme facilite la gestion des soins médicaux en connectant patients et professionnels de santé de manière intuitive et efficace.", active: true },
  { id: 2, iconName: "LayoutDashboard", gradient: "from-violet-600 to-violet-400", title: "Organisation simplifiée des soins", text: "Une solution qui simplifie la prise de rendez-vous, la gestion des dossiers patients et l'accès à un réseau de médecins.", active: true },
  { id: 3, iconName: "Lightbulb", gradient: "from-cyan-600 to-cyan-400", title: "Outils IA & aide au diagnostic", text: "Un espace centralisé pour optimiser la pratique et accéder à des outils d'aide au diagnostic basés sur l'IA.", active: true },
];

type CmsContextValue = {
  posts: Post[];
  addPost: (post: Omit<Post, "id" | "views" | "commentsCount" | "publishedAt" | "updatedAt">) => void;
  updatePost: (id: number, data: Partial<Post>) => void;
  deletePost: (id: number) => void;
  testimonials: Testimonial[];
  addTestimonial: (testimonial: Omit<Testimonial, "id">) => void;
  updateTestimonial: (id: number, data: Partial<Testimonial>) => void;
  deleteTestimonial: (id: number) => void;
  partners: Partner[];
  addPartner: (partner: Omit<Partner, "id">) => void;
  updatePartner: (id: number, data: Partial<Partner>) => void;
  deletePartner: (id: number) => void;
  specialties: Specialty[];
  addSpecialty: (specialty: Omit<Specialty, "id">) => void;
  updateSpecialty: (id: number, data: Partial<Specialty>) => void;
  deleteSpecialty: (id: number) => void;
  whyFeatures: WhyFeature[];
  addWhyFeature: (feature: Omit<WhyFeature, "id">) => void;
  updateWhyFeature: (id: number, data: Partial<WhyFeature>) => void;
  deleteWhyFeature: (id: number) => void;
};

const CmsContext = createContext<CmsContextValue | null>(null);

export function CmsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [testimonials, setTestimonials] = useState<Testimonial[]>(INITIAL_TESTIMONIALS);
  const [partners, setPartners] = useState<Partner[]>(INITIAL_PARTNERS);
  const [specialties, setSpecialties] = useState<Specialty[]>(INITIAL_SPECIALTIES);
  const [whyFeatures, setWhyFeatures] = useState<WhyFeature[]>(INITIAL_WHY_FEATURES);

  const now = () => new Date().toLocaleDateString("fr-TN", { day: "numeric", month: "short", year: "numeric" });

  const addPost: CmsContextValue["addPost"] = (data) => {
    setPosts((prev) => [
      {
        ...data,
        id: Date.now(),
        views: 0,
        commentsCount: 0,
        publishedAt: data.status === "publié" ? now() : "",
        updatedAt: now(),
      },
      ...prev,
    ]);
  };

  const updatePost: CmsContextValue["updatePost"] = (id, data) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? {
              ...post,
              ...data,
              updatedAt: now(),
              publishedAt: data.status === "publié" && !post.publishedAt ? now() : data.publishedAt ?? post.publishedAt,
            }
          : post,
      ),
    );
  };

  const deletePost = (id: number) => setPosts((prev) => prev.filter((post) => post.id !== id));
  const addTestimonial = (testimonial: Omit<Testimonial, "id">) => setTestimonials((prev) => [...prev, { ...testimonial, id: Date.now() }]);
  const updateTestimonial = (id: number, data: Partial<Testimonial>) => setTestimonials((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  const deleteTestimonial = (id: number) => setTestimonials((prev) => prev.filter((item) => item.id !== id));
  const addPartner = (partner: Omit<Partner, "id">) => setPartners((prev) => [...prev, { ...partner, id: Date.now() }]);
  const updatePartner = (id: number, data: Partial<Partner>) => setPartners((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  const deletePartner = (id: number) => setPartners((prev) => prev.filter((item) => item.id !== id));
  const addSpecialty = (specialty: Omit<Specialty, "id">) => setSpecialties((prev) => [...prev, { ...specialty, id: Date.now() }]);
  const updateSpecialty = (id: number, data: Partial<Specialty>) => setSpecialties((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  const deleteSpecialty = (id: number) => setSpecialties((prev) => prev.filter((item) => item.id !== id));
  const addWhyFeature = (feature: Omit<WhyFeature, "id">) => setWhyFeatures((prev) => [...prev, { ...feature, id: Date.now() }]);
  const updateWhyFeature = (id: number, data: Partial<WhyFeature>) => setWhyFeatures((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  const deleteWhyFeature = (id: number) => setWhyFeatures((prev) => prev.filter((item) => item.id !== id));

  return (
    <CmsContext.Provider
      value={{
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
