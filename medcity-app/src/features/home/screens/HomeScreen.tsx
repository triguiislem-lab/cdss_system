import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import {
  Search, ArrowRight, Brain, Bone, Wind, Syringe, Heart,
  Star, MessageSquare, Calendar, FileText, Users,
  Network, LayoutDashboard, Lightbulb, TrendingUp, Shield, Stethoscope,
  Pill, MapPin, Lock, X, ChevronRight, AlertTriangle, Zap,
  Eye, Activity, Baby, BookMarked, Globe, CheckCircle, type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { useCms } from "@/contexts/CmsContext";
import { useI18n } from "@/i18n/I18nProvider";
import { tunisianMedicines, type TunisianMedicine } from "@/lib/tunisia-medicines";
import { LoadingState } from "@/components/molecules/LoadingState";

type SearchMode = "medecins" | "medicaments";

type HomeDoctor = {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  city: string;
  available: boolean;
  rating: number;
  reviews: number;
  experience: number;
  address: string;
  phone: string;
  languages: string[];
  bio: string;
  fee: string;
  nextSlot: string;
  acts: string[];
};

type FeatureItem = {
  id: string;
  title: string;
  text: string;
  icon: LucideIcon;
  gradient: string;
};

type SpecialtyItem = {
  id: string;
  icon: LucideIcon;
  name: string;
  description: string;
  color: string;
  bg: string;
  query: string;
};

const HOME_DOCTORS: HomeDoctor[] = [
  {
    id: "d1",
    firstName: "Ahmed",
    lastName: "Ben Ali",
    specialty: "Médecine Générale",
    city: "Tunis",
    available: true,
    rating: 4.9,
    reviews: 187,
    experience: 12,
    address: "12 Rue de la Liberté, Tunis 1001",
    phone: "+216 71 123 456",
    languages: ["Arabe", "Français", "Anglais"],
    bio: "Médecin généraliste expérimenté, spécialisé dans la prise en charge des maladies chroniques, le suivi des patients diabétiques et hypertendus.",
    fee: "30 DT",
    nextSlot: "Aujourd'hui 14h30",
    acts: ["Consultation générale", "Suivi maladies chroniques", "Téléconsultation", "Certificats médicaux"],
  },
  {
    id: "d2",
    firstName: "Samar",
    lastName: "Ben Ali",
    specialty: "Chirurgie Plastique",
    city: "Tunis",
    available: false,
    rating: 4.8,
    reviews: 94,
    experience: 15,
    address: "5 Avenue Bourguiba, Tunis 1000",
    phone: "+216 71 234 567",
    languages: ["Arabe", "Français"],
    bio: "Chirurgienne plasticienne et reconstructrice avec 15 ans d'expérience, formée en France. Spécialisée en rhinoplastie, lifting et chirurgie reconstructrice.",
    fee: "80 DT",
    nextSlot: "Lundi 09h00",
    acts: ["Rhinoplastie", "Lifting facial", "Chirurgie des paupières", "Cicatrices"],
  },
  {
    id: "d3",
    firstName: "Khaled",
    lastName: "Mansour",
    specialty: "Médecine Générale",
    city: "Sfax",
    available: true,
    rating: 4.7,
    reviews: 213,
    experience: 9,
    address: "18 Rue Habib Thameur, Sfax 3000",
    phone: "+216 74 345 678",
    languages: ["Arabe", "Français"],
    bio: "Médecin généraliste à Sfax avec une approche centrée sur le patient. Prise en charge globale, préventive et curative.",
    fee: "25 DT",
    nextSlot: "Aujourd'hui 16h00",
    acts: ["Consultation générale", "Vaccination", "Bilan de santé", "Urgences légères"],
  },
  {
    id: "d4",
    firstName: "Fatima",
    lastName: "Zahra",
    specialty: "Neurologie",
    city: "Tunis",
    available: true,
    rating: 4.9,
    reviews: 156,
    experience: 18,
    address: "3 Rue Ibn Khaldoun, Tunis 1002",
    phone: "+216 71 456 789",
    languages: ["Arabe", "Français", "Anglais"],
    bio: "Neurologue référente, spécialisée dans les céphalées, la migraine, la SEP et les maladies neurodégénératives.",
    fee: "60 DT",
    nextSlot: "Demain 10h00",
    acts: ["Consultation neurologique", "EEG", "EMG", "Suivi SEP", "Céphalées"],
  },
  {
    id: "d5",
    firstName: "Rania",
    lastName: "Zouari",
    specialty: "Cardiologie",
    city: "Sousse",
    available: false,
    rating: 4.8,
    reviews: 121,
    experience: 14,
    address: "22 Boulevard de la Corniche, Sousse 4000",
    phone: "+216 73 567 890",
    languages: ["Arabe", "Français"],
    bio: "Cardiologue interventionnelle spécialisée en échocardiographie et cardiologie du sport.",
    fee: "70 DT",
    nextSlot: "Mercredi 11h00",
    acts: ["Consultation cardiologique", "ECG", "Échocardiographie", "Test d'effort"],
  },
  {
    id: "d6",
    firstName: "Mohamed",
    lastName: "Bouazizi",
    specialty: "Dermatologie",
    city: "Monastir",
    available: true,
    rating: 4.6,
    reviews: 88,
    experience: 8,
    address: "7 Rue de la République, Monastir 5000",
    phone: "+216 73 678 901",
    languages: ["Arabe", "Français"],
    bio: "Dermatologue et vénéréologue, spécialisé en dermatologie esthétique, acné et pathologies cutanées chroniques.",
    fee: "45 DT",
    nextSlot: "Aujourd'hui 15h00",
    acts: ["Consultation dermatologique", "Traitement acné", "Dermoscopie", "Injections esthétiques"],
  },
  {
    id: "d7",
    firstName: "Leila",
    lastName: "Hamdi",
    specialty: "Pédiatrie",
    city: "Ariana",
    available: true,
    rating: 4.9,
    reviews: 302,
    experience: 20,
    address: "9 Cité El Menzah, Ariana 2080",
    phone: "+216 71 789 012",
    languages: ["Arabe", "Français", "Anglais"],
    bio: "Pédiatre avec 20 ans d'expérience, spécialisée dans le développement de l'enfant, les vaccinations et les maladies pédiatriques.",
    fee: "40 DT",
    nextSlot: "Aujourd'hui 17h00",
    acts: ["Consultation pédiatrique", "Suivi croissance", "Vaccination", "Néonatologie"],
  },
  {
    id: "d8",
    firstName: "Yassine",
    lastName: "Koubaa",
    specialty: "Orthopédie",
    city: "Sfax",
    available: true,
    rating: 4.7,
    reviews: 145,
    experience: 11,
    address: "14 Avenue Farhat Hached, Sfax 3001",
    phone: "+216 74 890 123",
    languages: ["Arabe", "Français"],
    bio: "Chirurgien orthopédiste spécialisé dans la chirurgie du genou, de la hanche et du rachis.",
    fee: "55 DT",
    nextSlot: "Demain 14h00",
    acts: ["Consultation orthopédique", "Arthroscopie", "Prothèse de genou", "Traumatologie"],
  },
  {
    id: "d9",
    firstName: "Nour",
    lastName: "Ben Amor",
    specialty: "Pneumologie",
    city: "Tunis",
    available: false,
    rating: 4.8,
    reviews: 73,
    experience: 7,
    address: "2 Rue de Carthage, Tunis 1001",
    phone: "+216 71 901 234",
    languages: ["Arabe", "Français"],
    bio: "Pneumologue spécialisée dans la prise en charge de l'asthme, la BPCO et les troubles du sommeil.",
    fee: "50 DT",
    nextSlot: "Jeudi 09h30",
    acts: ["Consultation pneumologique", "Spirométrie", "Bilan sommeil", "Bronchoscopie"],
  },
  {
    id: "d10",
    firstName: "Tarek",
    lastName: "Selmi",
    specialty: "Ophtalmologie",
    city: "Tunis",
    available: true,
    rating: 4.9,
    reviews: 198,
    experience: 16,
    address: "11 Rue Alain Savary, Tunis 1002",
    phone: "+216 71 012 345",
    languages: ["Arabe", "Français", "Anglais"],
    bio: "Ophtalmologue spécialisé en chirurgie réfractive, cataracte et glaucome.",
    fee: "65 DT",
    nextSlot: "Aujourd'hui 11h00",
    acts: ["Consultation ophtalmologique", "Chirurgie LASIK", "Cataracte", "Fond d'oeil"],
  },
];

const WHY_FEATURES: FeatureItem[] = [
  {
    id: "patients-pro",
    icon: Network,
    title: "Connexion patients & professionnels",
    text: "Notre plateforme facilite la gestion des soins médicaux en connectant patients et professionnels de santé de manière intuitive et efficace.",
    gradient: "from-blue-600 to-blue-400",
  },
  {
    id: "care-organization",
    icon: LayoutDashboard,
    title: "Organisation simplifiée des soins",
    text: "Nous proposons une solution qui simplifie la prise de rendez-vous, la gestion des dossiers patients et l'accès à un réseau de médecins et de spécialistes.",
    gradient: "from-violet-600 to-violet-400",
  },
  {
    id: "ai-tools",
    icon: Lightbulb,
    title: "Outils IA & aide au diagnostic",
    text: "Un espace centralisé où les professionnels de santé peuvent optimiser leur pratique et accéder à des outils d'aide au diagnostic basés sur l'intelligence artificielle.",
    gradient: "from-cyan-600 to-cyan-400",
  },
];

const SPECIALTIES: SpecialtyItem[] = [
  {
    id: "pneumology",
    icon: Wind,
    name: "Pneumologie",
    description: "Diagnostic, traitement et prévention des maladies respiratoires.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    query: "pneumology respiratory diseases",
  },
  {
    id: "neurology",
    icon: Brain,
    name: "Neurologie",
    description: "Troubles du système nerveux central, migraine, SEP et maladies neurodégénératives.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    query: "neurology nervous system",
  },
  {
    id: "orthopedics",
    icon: Bone,
    name: "Orthopédie",
    description: "Troubles du système musculo-squelettique, traumatologie et chirurgie articulaire.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    query: "orthopedics musculoskeletal",
  },
  {
    id: "cardiology",
    icon: Heart,
    name: "Cardiologie",
    description: "Maladies du coeur, hypertension, ECG et suivi cardiovasculaire.",
    color: "text-red-500",
    bg: "bg-red-500/10",
    query: "cardiology cardiovascular",
  },
  {
    id: "nursing",
    icon: Syringe,
    name: "Soins Infirmiers",
    description: "Services infirmiers, suivi patient et coordination des soins.",
    color: "text-green-500",
    bg: "bg-green-500/10",
    query: "nursing care virtual consultations",
  },
  {
    id: "aesthetics",
    icon: Star,
    name: "Chirurgie Esthétique",
    description: "Techniques avancées, suivi post-opératoire et chirurgie reconstructrice.",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    query: "plastic surgery aesthetics",
  },
];

const TESTIMONIALS = [
  {
    id: "t1",
    name: "Dr. Samar Ben Ali",
    role: "Chirurgienne Plasticienne",
    text: "En tant que chirurgienne plasticienne, j'utilise cette plateforme au quotidien. Elle est simple, intuitive et adaptée à ma pratique.",
    rating: 5,
  },
  {
    id: "t2",
    name: "Dr. Khaled Mansour",
    role: "Médecin Généraliste",
    text: "L'application est bien conçue, claire et agréable à utiliser. L'expérience est fluide, facile, et réellement utile au quotidien.",
    rating: 5,
  },
  {
    id: "t3",
    name: "Dr. Fatima Zahra",
    role: "Neurologue",
    text: "Une plateforme remarquable pour la gestion médicale en Tunisie. La recherche scientifique est rapide et précise.",
    rating: 5,
  },
];

const PARTNERS = [
  {
    id: "pharmaghreb",
    name: "Pharmaghreb",
    logoUrl: "https://medcity.tn/wp-content/uploads/2025/04/Pharmaghreb-e1745837900416-1024x300.webp",
    websiteUrl: "https://pharmaghreb.com",
  },
  {
    id: "pct",
    name: "Pharmacie Centrale de Tunisie",
    logoUrl: "",
    websiteUrl: "https://pct.tn",
  },
];

const SEARCH_PLACEHOLDERS: Record<SearchMode, string> = {
  medecins: "Nom du médecin, spécialité, ville...",
  medicaments: "Nom du médicament, DCI, classe thérapeutique...",
};

const HOME_ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Baby,
  Bone,
  BookMarked,
  Brain,
  Calendar,
  CheckCircle,
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

export default function Home() {
  const { t } = useI18n();
  const { specialties, testimonials, partners, whyFeatures, loading: cmsLoading } = useCms();
  const [, setLocation] = useLocation();
  const [searchMode, setSearchMode] = useState<SearchMode>("medecins");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<TunisianMedicine | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<HomeDoctor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const cmsWhyFeatures = whyFeatures.filter((item) => item.active).map((item) => ({
    ...item,
    icon: HOME_ICON_MAP[item.iconName] ?? Lightbulb,
  }));

  const cmsSpecialties = specialties.filter((item) => item.active).map((item) => ({
    ...item,
    icon: HOME_ICON_MAP[item.iconName] ?? Stethoscope,
  }));

  const cmsTestimonials = testimonials.filter((item) => item.active);
  const cmsPartners = partners.filter((item) => item.active);

  const doctorResults = HOME_DOCTORS.filter((doctor) => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return false;
    return [
      `${doctor.firstName} ${doctor.lastName}`,
      doctor.specialty,
      doctor.city,
      doctor.address,
    ].some((value) => value.toLowerCase().includes(q));
  }).slice(0, 5);

  const medicineResults = tunisianMedicines.filter((medicine) => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return false;
    return [
      medicine.dci,
      medicine.atcCode,
      medicine.drugClass,
      medicine.indication,
      ...medicine.brands,
      ...medicine.forms,
      ...medicine.laboratories,
    ].some((value) => value.toLowerCase().includes(q));
  }).slice(0, 5);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (searchMode === "medecins") {
      const first = doctorResults[0];
      if (first) setSelectedDoctor(first);
      else setLocation("/doctors");
      return;
    }

    const first = medicineResults[0];
    if (first) setSelectedMedicine(first);
  };

  const setHeroSuggestion = (term: string) => {
    setSearchQuery(term);
    setShowSuggestions(true);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative bg-primary pt-20 pb-36 overflow-hidden flex flex-col items-center justify-center text-center px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -right-[5%] w-[45%] h-[140%] rounded-full bg-accent/25 blur-3xl opacity-60 mix-blend-screen" />
          <div className="absolute top-[30%] -left-[10%] w-[35%] h-[80%] rounded-full bg-cyan-400/15 blur-3xl opacity-40 mix-blend-screen" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10 px-4 py-1.5 text-sm">
            {t("home.hero.badge")}
          </Badge>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-tight">
            {t("home.hero.titlePrefix")}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-300">
              {t("home.hero.titleHighlight")}
            </span>
          </h1>

          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto font-light leading-relaxed">
            {t("home.hero.subtitle")}
          </p>

          <div className="max-w-3xl mx-auto mt-10 w-full" ref={containerRef}>
            <div className="flex justify-center mb-4">
              <div className="inline-flex bg-white/10 backdrop-blur-sm rounded-2xl p-1 gap-1">
                {([
                  { id: "medecins" as SearchMode, label: t("home.search.doctors"), icon: Stethoscope },
                  { id: "medicaments" as SearchMode, label: t("home.search.medicines"), icon: Pill },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSearchMode(tab.id);
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                    className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      searchMode === tab.id
                        ? "bg-white text-primary shadow-lg"
                        : "text-white/75 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSearch} className="relative group">
              <div className="relative flex items-center shadow-2xl rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-accent/30 transition-all duration-300">
                <div className="absolute left-4 z-10 text-muted-foreground">
                  {searchMode === "medecins" ? (
                    <Stethoscope className="h-6 w-6" />
                  ) : (
                    <Pill className="h-6 w-6" />
                  )}
                </div>
                <Input
                  type="text"
                  placeholder={searchMode === "medecins" ? t("home.search.doctorPlaceholder") : t("home.search.medicinePlaceholder")}
                  className="pl-14 pr-32 sm:pr-36 h-16 w-full text-base sm:text-lg bg-background border-none rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
                <div className="absolute right-2 z-10">
                  <Button
                    type="submit"
                    size="default"
                    className="h-12 px-6 rounded-lg text-base font-medium shadow-md bg-accent hover:bg-accent/90 transition-transform hover:scale-105 active:scale-95"
                  >
                    {t("common.search")}
                  </Button>
                </div>
              </div>

              {searchMode === "medecins" && showSuggestions && searchQuery.length > 1 && (
                <div className="absolute top-full mt-2 w-full bg-background border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {doctorResults.length > 0 ? (
                    <>
                      <div className="px-4 py-2 bg-muted/40 border-b text-xs text-muted-foreground font-semibold uppercase tracking-widest">
                        {t("home.search.doctorsFound", { count: doctorResults.length })}
                      </div>
                      {doctorResults.map((doctor) => (
                        <button
                          key={doctor.id}
                          type="button"
                          onClick={() => {
                            setSelectedDoctor(doctor);
                            setShowSuggestions(false);
                          }}
                          className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 transition-colors border-b last:border-0"
                        >
                          <span className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {doctor.firstName[0]}{doctor.lastName[0]}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-foreground text-sm">Dr. {doctor.firstName} {doctor.lastName}</span>
                            <span className="block text-xs text-muted-foreground">{doctor.specialty} - {t("doctorsDirectory.experience", { years: doctor.experience })}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                              <span className="flex items-center gap-1 text-amber-500 font-medium">
                                <Star className="h-3 w-3 fill-amber-400" /> {doctor.rating}
                                <span className="text-muted-foreground font-normal">{t("doctorsDirectory.reviews", { count: doctor.reviews })}</span>
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {doctor.city}
                              </span>
                            </span>
                          </span>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${doctor.available ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                            {doctor.available ? t("home.search.available") : t("home.search.unavailable")}
                          </span>
                        </button>
                      ))}
                      <div className="p-3 bg-muted/30 text-center">
                        <Link href="/doctors" className="text-xs text-accent font-semibold hover:underline inline-flex items-center gap-1">
                          {t("home.search.viewAllDoctors")} <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      {t("home.search.noDoctor", { query: searchQuery })}
                    </div>
                  )}
                </div>
              )}

              {searchMode === "medicaments" && showSuggestions && searchQuery.length > 1 && (
                <div className="absolute top-full mt-2 w-full bg-background border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {medicineResults.length > 0 ? (
                    <>
                      <div className="px-4 py-2 bg-muted/40 border-b text-xs text-muted-foreground font-semibold uppercase tracking-widest">
                        {t("home.search.medicinesFound", { count: medicineResults.length })}
                      </div>
                      {medicineResults.map((medicine) => (
                        <button
                          key={medicine.id}
                          type="button"
                          onClick={() => {
                            setSelectedMedicine(medicine);
                            setShowSuggestions(false);
                          }}
                          className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/50 transition-colors border-b last:border-0"
                        >
                          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                            <Pill className="h-5 w-5 text-white" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-foreground text-sm">{medicine.dci}</span>
                            <span className="block text-xs text-muted-foreground">{medicine.brands.join(", ")}</span>
                            <span className="mt-1 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-cyan-50 text-cyan-700 px-2 py-0.5">{medicine.drugClass}</span>
                              <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5">{medicine.atcCode}</span>
                              <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5">CNAM {medicine.reimbursement}</span>
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      {t("home.search.noMedicine", { query: searchQuery })}
                    </div>
                  )}
                </div>
              )}
            </form>

            {searchMode === "medicaments" && (
              <div className="flex flex-wrap justify-center gap-2 mt-5 text-sm text-primary-foreground/70">
                <span>{t("home.search.popular")}</span>
                {["Paracétamol", "Ibuprofène", "Amoxicilline", "Metformine", "Oméprazole"].map((term) => (
                  <button
                    key={term}
                    className="px-3 py-1 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
                    onClick={() => setHeroSuggestion(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}

            {searchMode === "medecins" && (
              <div className="flex flex-wrap justify-center gap-2 mt-5 text-sm text-primary-foreground/70">
                <span>{t("home.search.specialties")}</span>
                {["Cardiologie", "Neurologie", "Pédiatrie", "Dermatologie", "Orthopédie"].map((term) => (
                  <button
                    key={term}
                    className="px-3 py-1 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
                    onClick={() => setHeroSuggestion(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {cmsLoading && !cmsWhyFeatures.length && (
        <section className="bg-slate-50 px-4 py-8">
          <div className="container mx-auto max-w-3xl">
            <LoadingState
              title="Chargement du contenu public"
              subtitle="Synchronisation des sections CMS depuis NestJS..."
            />
          </div>
        </section>
      )}

      <section className="py-24 bg-white overflow-hidden">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="flex flex-col lg:flex-row items-center gap-16 xl:gap-24">
            <div className="flex-1 min-w-0">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight mb-4">
                {t("home.why.titlePrefix")}{" "}
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #1565c0, #1e90ff)" }}>
                  MedCity
                </span>{" "}?
              </h2>
              <div className="w-14 h-1 rounded-full mb-10" style={{ background: "linear-gradient(90deg, #1565c0, #1e90ff)" }} />

              <div className="space-y-8">
                {cmsWhyFeatures.map((item) => (
                  <div key={item.id} className="flex gap-5 group">
                    <div className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <item.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base mb-1">{item.title}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:shrink-0 lg:w-[480px] xl:w-[520px]">
              <div className="relative">
                <img
                  src="/medcity-doctor.jpg"
                  alt={t("home.why.imageAlt")}
                  className="w-full h-auto object-cover rounded-3xl shadow-2xl"
                />
                <div className="absolute -top-6 -left-6 w-36 h-36 rounded-full -z-10" style={{ background: "radial-gradient(circle, rgba(21,101,192,0.12) 0%, transparent 70%)" }} />
                <div className="absolute -bottom-6 -right-6 w-48 h-48 rounded-full -z-10" style={{ background: "radial-gradient(circle, rgba(30,144,255,0.10) 0%, transparent 70%)" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-4">{t("home.specialties.badge")}</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t("home.specialties.titlePrefix")}{" "}
              <span className="text-primary">{t("home.specialties.titleHighlight")}</span>
            </h2>
            <p className="text-muted-foreground mt-4 text-lg max-w-2xl mx-auto">
              {t("home.specialties.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {cmsSpecialties.map((spec) => (
                <Card key={spec.id} className="h-full border-border/50 transition-all duration-300 group">
                  <CardHeader className="pb-3">
                    <div className={`w-12 h-12 rounded-lg ${spec.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <spec.icon className={`h-6 w-6 ${spec.color}`} />
                    </div>
                    <CardTitle className="text-lg group-hover:text-accent transition-colors">{spec.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{spec.description}</p>
                    <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("home.specialties.cardLabel")}
                    </div>
                  </CardContent>
                </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <Badge className="bg-accent/10 text-accent border-accent/20 mb-4">{t("home.testimonials.badge")}</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t("home.testimonials.titlePrefix")}{" "}
              <span className="text-accent">{t("home.testimonials.titleHighlight")}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {cmsTestimonials.map((t) => (
              <Card key={t.id} className="border-border/50 hover:shadow-lg transition-shadow duration-300">
                <CardContent className="pt-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 italic">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                      {t.name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white border-t border-slate-100">
        <div className="container mx-auto px-6 max-w-5xl text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] mb-10">{t("home.partners.title")}</p>
          <div className="flex flex-wrap justify-center items-center gap-12">
            {cmsPartners.map((partner) => (
              partner.logoUrl ? (
                <a
                  key={partner.id}
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-70 hover:opacity-100 transition-opacity"
                  title={partner.name}
                >
                  <img src={partner.logoUrl} alt={partner.name} className="h-20 md:h-28 object-contain max-w-[200px]" />
                </a>
              ) : (
                <div key={partner.id} className="h-20 flex items-center px-6 rounded-xl border border-slate-100 text-slate-500 font-semibold text-sm">
                  {partner.name}
                </div>
              )
            ))}
          </div>
        </div>
      </section>

      {selectedDoctor && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(10,20,40,0.65)", backdropFilter: "blur(6px)" }}
          onClick={() => setSelectedDoctor(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative rounded-t-3xl overflow-hidden px-7 pt-8 pb-6" style={{ background: "linear-gradient(135deg, #0d2d5e 0%, #1565c0 60%, #1e90ff 100%)" }}>
              <button
                onClick={() => setSelectedDoctor(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4 text-white" />
              </button>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur border-2 border-white/30 flex items-center justify-center text-white font-extrabold text-2xl shrink-0">
                  {selectedDoctor.firstName[0]}{selectedDoctor.lastName[0]}
                </div>
                <div>
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">{selectedDoctor.specialty}</p>
                  <h2 className="text-2xl font-extrabold text-white">Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-amber-300 text-sm font-semibold">
                      <Star className="h-4 w-4 fill-amber-300" /> {selectedDoctor.rating}
                      <span className="text-white/50 font-normal">{t("doctorsDirectory.reviews", { count: selectedDoctor.reviews })}</span>
                    </span>
                    <span className="text-white/40">-</span>
                    <span className="text-white/70 text-sm">{t("doctorsDirectory.experience", { years: selectedDoctor.experience })}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${selectedDoctor.available ? "bg-green-400/20 text-green-300 border border-green-400/30" : "bg-white/10 text-white/50 border border-white/20"}`}>
                  {selectedDoctor.available ? `● ${t("home.search.available")}` : `● ${t("home.search.unavailable")}`}
                </span>
                {selectedDoctor.available && (
                  <span className="text-xs text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/20">
                    {t("home.doctorModal.nextSlot", { slot: selectedDoctor.nextSlot })}
                  </span>
                )}
              </div>
            </div>

            <div className="px-7 py-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("home.doctorModal.presentation")}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedDoctor.bio}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: MapPin, label: t("home.doctorModal.address"), value: selectedDoctor.address },
                  { icon: FileText, label: t("home.doctorModal.fees"), value: t("home.doctorModal.feeValue", { fee: selectedDoctor.fee }) },
                  { icon: MessageSquare, label: t("home.doctorModal.languages"), value: selectedDoctor.languages.join(", ") },
                  { icon: Users, label: t("home.doctorModal.patientReviews"), value: t("home.doctorModal.reviewValue", { count: selectedDoctor.reviews, rating: selectedDoctor.rating }) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-4 w-4 text-primary" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
                    </div>
                    <p className="text-sm text-slate-700 font-medium">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t("home.doctorModal.acts")}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedDoctor.acts.map((act) => (
                    <span key={act} className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-medium">{act}</span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button className="flex-1 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold shadow-lg text-sm">
                  <Calendar className="h-4 w-4 mr-2" /> {t("home.doctorModal.book")}
                </Button>
                <Button variant="outline" className="h-12 px-5 rounded-xl border-slate-200 text-slate-600 text-sm font-semibold">
                  <FileText className="h-4 w-4 mr-2" /> {t("home.doctorModal.contact")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedMedicine && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(10,20,40,0.65)", backdropFilter: "blur(6px)" }}
          onClick={() => setSelectedMedicine(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b rounded-t-3xl px-7 py-5 flex items-start justify-between z-10">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <Pill className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">{selectedMedicine.dci}</h2>
                    <p className="text-xs text-slate-400">{selectedMedicine.brands.join(", ")}</p>
                  </div>
                </div>
                <Badge className="mt-1 bg-blue-50 text-blue-700 border-blue-100 text-xs">{selectedMedicine.drugClass}</Badge>
              </div>
              <button onClick={() => setSelectedMedicine(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors" aria-label={t("common.close")}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="px-7 py-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t("home.medicineModal.forms")}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedMedicine.forms.map((form) => (
                    <span key={form} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">{form}</span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t("home.medicineModal.indication")}</p>
                <p className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{selectedMedicine.indication}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ATC</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMedicine.atcCode}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">CNAM</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMedicine.reimbursement}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t("home.medicineModal.approxPrice")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMedicine.priceTndApprox} TND</p>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-amber-200">
                <div className="blur-sm select-none pointer-events-none p-6 space-y-4 bg-slate-50">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("home.medicineModal.adultDosage")}</p>
                    <p className="text-sm text-slate-700">{selectedMedicine.posologyAdult}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("home.medicineModal.contraindications")}</p>
                    {selectedMedicine.contraindications.map((contraindication) => (
                      <p key={contraindication} className="text-sm text-red-700">• {contraindication}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("home.medicineModal.monitoring")}</p>
                    <p className="text-sm text-slate-700">{t("home.medicineModal.monitoringText")}</p>
                  </div>
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-white/10 via-white/80 to-white/95 p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
                    <Lock className="h-6 w-6 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 mb-1">{t("home.medicineModal.lockedTitle")}</h3>
                  <p className="text-sm text-slate-500 max-w-xs mb-5">
                    {t("home.medicineModal.lockedText")}
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center mb-5">
                    {[
                      { icon: Zap, label: t("home.medicineModal.fullDosage") },
                      { icon: AlertTriangle, label: t("home.medicineModal.contraindications") },
                      { icon: Shield, label: t("home.medicineModal.interactions") },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                        <Icon className="h-3 w-3 text-amber-500" /> {label}
                      </span>
                    ))}
                  </div>
                  <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg text-sm h-auto">
                    {t("home.medicineModal.accessPro")}
                  </Button>
                  <p className="text-xs text-slate-400 mt-3">{t("home.medicineModal.proPrice")}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedMedicine.renalAdjust && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold"><Shield className="h-3 w-3" /> {t("home.medicineModal.renalAdjust")}</span>}
                {selectedMedicine.hepaticAdjust && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 text-orange-700 px-3 py-1 text-xs font-semibold"><AlertTriangle className="h-3 w-3" /> {t("home.medicineModal.hepaticAdjust")}</span>}
                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-3 py-1 text-xs font-semibold">{selectedMedicine.pregnancy}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
