import { useEffect, useMemo, useState } from "react";
import { Building2, Search, MapPin, Phone, Filter, X } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Card, CardContent } from "@/components/atoms/card";
import { useI18n } from "@/i18n/I18nProvider";
import { listPublicDoctors, type ApiPublicDoctor } from "@/lib/backend-api";
import { LoadingState } from "@/components/molecules/LoadingState";
import { RatingStars } from "@/components/molecules/RatingStars";

type Doctor = ApiPublicDoctor;

const ALL_SPECIALTIES = "__all_specialties__";
const ALL_CITIES = "__all_cities__";

const AVATAR_COLORS = [
  "bg-blue-500", "bg-teal-500", "bg-purple-500", "bg-rose-500",
  "bg-amber-500", "bg-green-500", "bg-cyan-500", "bg-indigo-500",
];

function DoctorCard({ doctor, index }: { doctor: Doctor; index: number }) {
  const { t } = useI18n();
  const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const fullName = `Dr. ${doctor.firstName} ${doctor.lastName}`.trim();
  const initials = [doctor.firstName, doctor.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const location = [doctor.address, doctor.city].filter(Boolean).join(", ");

  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-border/50 hover:border-accent/30 group">
      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-xl ${colorClass} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
            {initials || "DR"}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors text-base leading-tight">
                  {fullName}
                </h3>
                <p className="text-accent text-sm font-medium mt-0.5">
                  {doctor.specialty || t("common.notProvided")}
                </p>
                {typeof doctor.rating === "number" && (
                  <div className="flex items-center gap-2 mt-2">
                    <RatingStars rating={doctor.rating} />
                    <span className="text-sm font-semibold text-foreground">
                      {doctor.rating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Facility */}
            {doctor.facility && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{doctor.facility}</span>
              </div>
            )}

            {/* Location */}
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {location || t("common.notProvided")}
              </span>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{doctor.phone || t("common.notProvided")}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

export default function Doctors() {
  const { t } = useI18n();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState(ALL_SPECIALTIES);
  const [selectedCity, setSelectedCity] = useState(ALL_CITIES);

  const specialties = useMemo(
    () => [
      ALL_SPECIALTIES,
      ...Array.from(
        new Set(
          doctors
            .map((doctor) => doctor.specialty?.trim())
            .filter((specialty): specialty is string => Boolean(specialty)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [doctors],
  );
  const cities = useMemo(
    () => [
      ALL_CITIES,
      ...Array.from(
        new Set(
          doctors
            .map((doctor) => doctor.city?.trim())
            .filter((city): city is string => Boolean(city)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [doctors],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void listPublicDoctors()
      .then((apiDoctors) => {
        if (!cancelled) setDoctors(apiDoctors);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Annuaire indisponible.");
          setDoctors([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return doctors.filter((d) => {
      const q = search.toLowerCase();
      const searchableFields = [
        d.firstName,
        d.lastName,
        d.specialty,
        d.facility,
        d.city,
        d.address,
        d.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchSearch = !q || searchableFields.includes(q);

      const matchSpecialty =
        selectedSpecialty === ALL_SPECIALTIES || d.specialty === selectedSpecialty;

      const matchCity =
        selectedCity === ALL_CITIES || d.city === selectedCity;

      return matchSearch && matchSpecialty && matchCity;
    });

  }, [doctors, search, selectedSpecialty, selectedCity]);

  const activeFilterCount = [
    selectedSpecialty !== ALL_SPECIALTIES,
    selectedCity !== ALL_CITIES,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedSpecialty(ALL_SPECIALTIES);
    setSelectedCity(ALL_CITIES);
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
                  {specialties.map((spec) => (
                    <button
                      key={spec}
                      onClick={() => setSelectedSpecialty(spec)}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        selectedSpecialty === spec
                          ? "bg-accent text-white font-medium"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {spec === ALL_SPECIALTIES ? t("doctorsDirectory.allSpecialties") : spec}
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div className="border rounded-xl p-4 space-y-3 bg-card">
                <h3 className="text-sm font-semibold">{t("doctorsDirectory.city")}</h3>
                <div className="space-y-1.5">
                  {cities.map((city) => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        selectedCity === city
                          ? "bg-accent text-white font-medium"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {city === ALL_CITIES ? t("doctorsDirectory.allCities") : city}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </aside>

          {/* Results */}
          <main className="flex-1 min-w-0">
            {loadError && (
              <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                Backend annuaire indisponible: aucune donnée locale de remplacement n'est affichée.
              </div>
            )}

            {/* Top bar */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
                {t("doctorsDirectory.resultsFound", { count: filtered.length })}
                {selectedSpecialty !== ALL_SPECIALTIES && (
                  <> {t("doctorsDirectory.inSpecialty")} <span className="text-accent font-medium">{selectedSpecialty}</span></>
                )}
              </p>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedSpecialty !== ALL_SPECIALTIES && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    {selectedSpecialty}
                    <button onClick={() => setSelectedSpecialty(ALL_SPECIALTIES)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {selectedCity !== ALL_CITIES && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    {selectedCity}
                    <button onClick={() => setSelectedCity(ALL_CITIES)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Doctor cards */}
            {loading ? (
              <LoadingState
                title="Chargement de l'annuaire"
                subtitle="Recuperation des medecins publies depuis NestJS..."
              />
            ) : filtered.length > 0 ? (
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
