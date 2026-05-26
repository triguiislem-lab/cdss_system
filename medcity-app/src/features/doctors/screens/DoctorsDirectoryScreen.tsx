import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Search, MapPin, Star, Phone, Calendar, Video, Filter, X, ChevronDown, Clock, Languages } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Card, CardContent } from "@/components/atoms/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select";
import { useI18n } from "@/i18n/I18nProvider";

type Doctor = {
  id: number;
  name: string;
  specialty: string;
  subSpecialty?: string;
  rating: number;
  reviewCount: number;
  location: string;
  city: string;
  hospital: string;
  experience: number;
  languages: string[];
  availableToday: boolean;
  teleconsultation: boolean;
  consultationFee: number;
  avatar: string;
  nextSlot: string;
};

const DOCTORS: Doctor[] = [
  {
    id: 1,
    name: "Dr. Samar Ben Ali",
    specialty: "Chirurgie Esthetique",
    subSpecialty: "Rhinoplastie & Lifting",
    rating: 4.9,
    reviewCount: 128,
    location: "Les Berges du Lac, Tunis",
    city: "Tunis",
    hospital: "Clinique Hannibal",
    experience: 14,
    languages: ["Arabe", "Francais", "Anglais"],
    availableToday: true,
    teleconsultation: true,
    consultationFee: 80,
    avatar: "SB",
    nextSlot: "Aujourd'hui 14h30",
  },
  {
    id: 2,
    name: "Dr. Khaled Mansour",
    specialty: "Cardiologie",
    subSpecialty: "Cardiologie interventionnelle",
    rating: 4.8,
    reviewCount: 214,
    location: "Centre Ville, Tunis",
    city: "Tunis",
    hospital: "Clinique Taoufik",
    experience: 20,
    languages: ["Arabe", "Francais"],
    availableToday: false,
    teleconsultation: true,
    consultationFee: 100,
    avatar: "KM",
    nextSlot: "Demain 09h00",
  },
  {
    id: 3,
    name: "Dr. Fatima Zahra",
    specialty: "Neurologie",
    subSpecialty: "Epilepsie & Troubles du sommeil",
    rating: 4.7,
    reviewCount: 97,
    location: "Menzah 6, Tunis",
    city: "Tunis",
    hospital: "Clinique El Amen",
    experience: 11,
    languages: ["Arabe", "Francais"],
    availableToday: true,
    teleconsultation: false,
    consultationFee: 70,
    avatar: "FZ",
    nextSlot: "Aujourd'hui 16h00",
  },
  {
    id: 4,
    name: "Dr. Mehdi Trabelsi",
    specialty: "Orthopedie",
    subSpecialty: "Chirurgie du genou & de l'epaule",
    rating: 4.6,
    reviewCount: 183,
    location: "Soukra, Tunis",
    city: "Tunis",
    hospital: "Polyclinique Soukra",
    experience: 16,
    languages: ["Arabe", "Francais", "Anglais"],
    availableToday: false,
    teleconsultation: false,
    consultationFee: 90,
    avatar: "MT",
    nextSlot: "Jeudi 10h30",
  },
  {
    id: 5,
    name: "Dr. Rim Karray",
    specialty: "Pneumologie",
    subSpecialty: "Asthme & Allergologie",
    rating: 4.8,
    reviewCount: 76,
    location: "Sfax Centre",
    city: "Sfax",
    hospital: "Clinique Essalem",
    experience: 9,
    languages: ["Arabe", "Francais"],
    availableToday: true,
    teleconsultation: true,
    consultationFee: 60,
    avatar: "RK",
    nextSlot: "Aujourd'hui 11h00",
  },
  {
    id: 6,
    name: "Dr. Amine Gharbi",
    specialty: "Pediatrie",
    subSpecialty: "Neonatologie",
    rating: 4.9,
    reviewCount: 305,
    location: "Ennasr 2, Tunis",
    city: "Tunis",
    hospital: "Clinique Les Oliviers",
    experience: 18,
    languages: ["Arabe", "Francais"],
    availableToday: true,
    teleconsultation: true,
    consultationFee: 75,
    avatar: "AG",
    nextSlot: "Aujourd'hui 15h00",
  },
  {
    id: 7,
    name: "Dr. Nadia Chaabane",
    specialty: "Dermatologie",
    subSpecialty: "Dermatologie esthetique",
    rating: 4.7,
    reviewCount: 152,
    location: "La Marsa, Tunis",
    city: "Tunis",
    hospital: "Cabinet prive",
    experience: 13,
    languages: ["Arabe", "Francais", "Anglais"],
    availableToday: false,
    teleconsultation: true,
    consultationFee: 85,
    avatar: "NC",
    nextSlot: "Mercredi 09h30",
  },
  {
    id: 8,
    name: "Dr. Sami Jebali",
    specialty: "Ophtalmologie",
    subSpecialty: "Chirurgie refractaire",
    rating: 4.5,
    reviewCount: 89,
    location: "Sousse Centre",
    city: "Sousse",
    hospital: "Clinique Ibn Rochd",
    experience: 12,
    languages: ["Arabe", "Francais"],
    availableToday: true,
    teleconsultation: false,
    consultationFee: 65,
    avatar: "SJ",
    nextSlot: "Aujourd'hui 17h00",
  },
  {
    id: 9,
    name: "Dr. Yasmine Boubaker",
    specialty: "Gynecologie",
    subSpecialty: "Obstetrique & infertilite",
    rating: 4.9,
    reviewCount: 241,
    location: "Lac 1, Tunis",
    city: "Tunis",
    hospital: "Clinique Hannibal",
    experience: 15,
    languages: ["Arabe", "Francais"],
    availableToday: false,
    teleconsultation: true,
    consultationFee: 95,
    avatar: "YB",
    nextSlot: "Vendredi 10h00",
  },
  {
    id: 10,
    name: "Dr. Omar Slama",
    specialty: "Psychiatrie",
    subSpecialty: "Troubles anxieux & depression",
    rating: 4.6,
    reviewCount: 67,
    location: "Mutuelle Ville, Tunis",
    city: "Tunis",
    hospital: "Cabinet prive",
    experience: 10,
    languages: ["Arabe", "Francais", "Anglais"],
    availableToday: true,
    teleconsultation: true,
    consultationFee: 80,
    avatar: "OS",
    nextSlot: "Aujourd'hui 18h00",
  },
  {
    id: 11,
    name: "Dr. Houda Belhassen",
    specialty: "Endocrinologie",
    subSpecialty: "Diabete & thyroide",
    rating: 4.7,
    reviewCount: 118,
    location: "Ariana Ville",
    city: "Ariana",
    hospital: "Clinique Ariana",
    experience: 14,
    languages: ["Arabe", "Francais"],
    availableToday: false,
    teleconsultation: true,
    consultationFee: 70,
    avatar: "HB",
    nextSlot: "Lundi 11h00",
  },
  {
    id: 12,
    name: "Dr. Raouf Ferchichi",
    specialty: "Cardiologie",
    subSpecialty: "Electrophysiologie",
    rating: 4.8,
    reviewCount: 135,
    location: "La Marsa, Tunis",
    city: "Tunis",
    hospital: "Clinique La Marsa",
    experience: 22,
    languages: ["Arabe", "Francais"],
    availableToday: true,
    teleconsultation: false,
    consultationFee: 110,
    avatar: "RF",
    nextSlot: "Aujourd'hui 13h00",
  },
];

const SPECIALTIES = [
  "Toutes les specialites",
  "Cardiologie",
  "Chirurgie Esthetique",
  "Dermatologie",
  "Endocrinologie",
  "Gynecologie",
  "Neurologie",
  "Ophtalmologie",
  "Orthopedie",
  "Pediatrie",
  "Pneumologie",
  "Psychiatrie",
];

const CITIES = ["Toutes les villes", "Tunis", "Sfax", "Sousse", "Ariana"];

const AVATAR_COLORS = [
  "bg-blue-500", "bg-teal-500", "bg-purple-500", "bg-rose-500",
  "bg-amber-500", "bg-green-500", "bg-cyan-500", "bg-indigo-500",
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${star <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function DoctorCard({ doctor, index }: { doctor: Doctor; index: number }) {
  const { t } = useI18n();
  const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-border/50 hover:border-accent/30 group">
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-xl ${colorClass} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
            {doctor.avatar}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors text-base leading-tight">
                  {doctor.name}
                </h3>
                <p className="text-accent text-sm font-medium mt-0.5">{doctor.specialty}</p>
                {doctor.subSpecialty && (
                  <p className="text-muted-foreground text-xs mt-0.5">{doctor.subSpecialty}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-foreground">{doctor.consultationFee} DT</p>
                <p className="text-xs text-muted-foreground">{t("doctorsDirectory.consultation")}</p>
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2 mt-2">
              <StarRating rating={doctor.rating} />
              <span className="text-sm font-semibold text-foreground">{doctor.rating}</span>
              <span className="text-xs text-muted-foreground">{t("doctorsDirectory.reviews", { count: doctor.reviewCount })}</span>
              <span className="text-muted-foreground">-</span>
              <span className="text-xs text-muted-foreground">{t("doctorsDirectory.experience", { years: doctor.experience })}</span>
            </div>

            {/* Location & Hospital */}
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{doctor.location} - {doctor.hospital}</span>
            </div>

            {/* Languages */}
            <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
              <Languages className="h-3.5 w-3.5 shrink-0" />
              <span>{doctor.languages.join(", ")}</span>
            </div>
          </div>
        </div>

        {/* Badges & CTA */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
          <div className="flex flex-wrap gap-2">
            {doctor.availableToday && (
              <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 border-green-200">
                {t("doctorsDirectory.availableToday")}
              </Badge>
            )}
            {doctor.teleconsultation && (
              <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 flex items-center gap-1">
                <Video className="h-3 w-3" /> {t("doctorsDirectory.teleconsultation")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{doctor.nextSlot}</span>
            </div>
            <Button size="sm" className="bg-accent hover:bg-accent/90 text-white text-xs h-8 px-3">
              <Calendar className="h-3.5 w-3.5 mr-1" />
              {t("doctorsDirectory.book")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Doctors() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("Toutes les specialites");
  const [selectedCity, setSelectedCity] = useState("Toutes les villes");
  const [onlyAvailableToday, setOnlyAvailableToday] = useState(false);
  const [onlyTeleconsult, setOnlyTeleconsult] = useState(false);
  const [sortBy, setSortBy] = useState("rating");

  const filtered = useMemo(() => {
    let result = DOCTORS.filter((d) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.subSpecialty?.toLowerCase().includes(q) ||
        d.hospital.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q);

      const matchSpecialty =
        selectedSpecialty === "Toutes les specialites" || d.specialty === selectedSpecialty;

      const matchCity =
        selectedCity === "Toutes les villes" || d.city === selectedCity;

      const matchAvailable = !onlyAvailableToday || d.availableToday;
      const matchTeleconsult = !onlyTeleconsult || d.teleconsultation;

      return matchSearch && matchSpecialty && matchCity && matchAvailable && matchTeleconsult;
    });

    if (sortBy === "rating") result = [...result].sort((a, b) => b.rating - a.rating);
    else if (sortBy === "experience") result = [...result].sort((a, b) => b.experience - a.experience);
    else if (sortBy === "fee_asc") result = [...result].sort((a, b) => a.consultationFee - b.consultationFee);
    else if (sortBy === "fee_desc") result = [...result].sort((a, b) => b.consultationFee - a.consultationFee);

    return result;
  }, [search, selectedSpecialty, selectedCity, onlyAvailableToday, onlyTeleconsult, sortBy]);

  const activeFilterCount = [
    selectedSpecialty !== "Toutes les specialites",
    selectedCity !== "Toutes les villes",
    onlyAvailableToday,
    onlyTeleconsult,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedSpecialty("Toutes les specialites");
    setSelectedCity("Toutes les villes");
    setOnlyAvailableToday(false);
    setOnlyTeleconsult(false);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="bg-primary py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-8">
            <Badge className="bg-accent/20 text-accent border-accent/30 mb-3">{t("doctorsDirectory.badge")}</Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{t("doctorsDirectory.title")}</h1>
            <p className="text-white/70 text-base max-w-xl mx-auto">
              {t("doctorsDirectory.subtitle")}
            </p>
          </div>

          {/* Main search bar */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
            <Input
              type="text"
              placeholder={t("doctorsDirectory.searchPlaceholder")}
              className="pl-12 h-14 text-base bg-background border-none rounded-xl shadow-xl focus-visible:ring-accent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar filters */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-24 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold flex items-center gap-2">
                  <Filter className="h-4 w-4 text-accent" />
                  {t("search.filters")}
                  {activeFilterCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-accent text-white text-xs font-medium">
                      {activeFilterCount}
                    </span>
                  )}
                </h2>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> {t("doctorsDirectory.clear")}
                  </button>
                )}
              </div>

              {/* Specialty */}
              <div className="border rounded-xl p-4 space-y-3 bg-card">
                <h3 className="text-sm font-semibold">{t("doctorsDirectory.specialty")}</h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {SPECIALTIES.map((spec) => (
                    <button
                      key={spec}
                      onClick={() => setSelectedSpecialty(spec)}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        selectedSpecialty === spec
                          ? "bg-accent text-white font-medium"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {spec === "Toutes les specialites" ? t("doctorsDirectory.allSpecialties") : spec}
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div className="border rounded-xl p-4 space-y-3 bg-card">
                <h3 className="text-sm font-semibold">{t("doctorsDirectory.city")}</h3>
                <div className="space-y-1.5">
                  {CITIES.map((city) => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        selectedCity === city
                          ? "bg-accent text-white font-medium"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {city === "Toutes les villes" ? t("doctorsDirectory.allCities") : city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="border rounded-xl p-4 space-y-3 bg-card">
                <h3 className="text-sm font-semibold">{t("doctorsDirectory.options")}</h3>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {t("doctorsDirectory.availableToday")}
                  </span>
                  <div
                    onClick={() => setOnlyAvailableToday(!onlyAvailableToday)}
                    className={`w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${
                      onlyAvailableToday ? "bg-accent" : "bg-muted-foreground/30"
                    }`}
                    style={{ height: "22px", width: "40px" }}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        onlyAvailableToday ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {t("doctorsDirectory.teleconsultation")}
                  </span>
                  <div
                    onClick={() => setOnlyTeleconsult(!onlyTeleconsult)}
                    className={`relative cursor-pointer rounded-full transition-colors ${
                      onlyTeleconsult ? "bg-accent" : "bg-muted-foreground/30"
                    }`}
                    style={{ height: "22px", width: "40px" }}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        onlyTeleconsult ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </label>
              </div>
            </div>
          </aside>

          {/* Results */}
          <main className="flex-1 min-w-0">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
                {t("doctorsDirectory.resultsFound", { count: filtered.length })}
                {selectedSpecialty !== "Toutes les specialites" && (
                  <> {t("doctorsDirectory.inSpecialty")} <span className="text-accent font-medium">{selectedSpecialty}</span></>
                )}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:block">{t("search.sortBy")}</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-44 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">{t("doctorsDirectory.sort.rating")}</SelectItem>
                    <SelectItem value="experience">{t("doctorsDirectory.sort.experience")}</SelectItem>
                    <SelectItem value="fee_asc">{t("doctorsDirectory.sort.feeAsc")}</SelectItem>
                    <SelectItem value="fee_desc">{t("doctorsDirectory.sort.feeDesc")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedSpecialty !== "Toutes les specialites" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    {selectedSpecialty}
                    <button onClick={() => setSelectedSpecialty("Toutes les specialites")}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {selectedCity !== "Toutes les villes" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    {selectedCity}
                    <button onClick={() => setSelectedCity("Toutes les villes")}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {onlyAvailableToday && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/10 text-green-700 text-xs font-medium">
                    {t("doctorsDirectory.availableToday")}
                    <button onClick={() => setOnlyAvailableToday(false)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {onlyTeleconsult && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 text-xs font-medium">
                    {t("doctorsDirectory.teleconsultation")}
                    <button onClick={() => setOnlyTeleconsult(false)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Doctor cards */}
            {filtered.length > 0 ? (
              <div className="space-y-4">
                {filtered.map((doctor, i) => (
                  <DoctorCard key={doctor.id} doctor={doctor} index={i} />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("doctorsDirectory.emptyTitle")}</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  {t("doctorsDirectory.emptyText")}
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  {t("doctorsDirectory.resetFilters")}
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
