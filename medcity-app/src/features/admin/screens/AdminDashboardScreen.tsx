import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  FileText,
  GitPullRequest,
  Pill,
  ScrollText,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { useI18n } from "@/i18n/I18nProvider";
import {
  listAuditEntries,
  listCmsPosts,
  listDoctors,
  listMedicineContributions,
  listMedicines,
} from "@/lib/backend-api";

type Accent = "info" | "success" | "warning" | "primary" | "muted";
type AuditEntry = Awaited<ReturnType<typeof listAuditEntries>>[number];

type KpiItem = {
  key: string;
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  accent: Accent;
  href: string;
};

const accentMap: Record<Accent, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  primary: "bg-primary-soft text-primary",
  muted: "bg-muted text-muted-foreground",
};

const quickActions = [
  {
    href: "/admin/doctors",
    label: "Gerer les medecins",
    description: "Comptes, specialites et statut d'acces.",
    icon: UserCheck,
  },
  {
    href: "/admin/cms",
    label: "Contenu public",
    description: "Articles, partenaires, temoignages et sections home.",
    icon: FileText,
  },
  {
    href: "/admin/cdss/medicine-contributions",
    label: "Contributions medicaments",
    description: "Validation des corrections proposees par les docteurs.",
    icon: GitPullRequest,
  },
  {
    href: "/admin/cdss/audit",
    label: "Audit CDSS",
    description: "Tracabilite des decisions de prescription.",
    icon: ScrollText,
  },
];

export default function AdminDashboard() {
  const { t, language } = useI18n();
  const [counts, setCounts] = useState({
    doctors: 0,
    posts: 0,
    medicines: 0,
    pendingContributions: 0,
    audits: 0,
  });
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString(
    language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  const kpis = useMemo<KpiItem[]>(() => [
    {
      key: "doctors",
      label: "Medecins",
      value: counts.doctors,
      helper: "Comptes geres dans NestJS",
      icon: UserCheck,
      accent: "primary",
      href: "/admin/doctors",
    },
    {
      key: "posts",
      label: "Contenus CMS",
      value: counts.posts,
      helper: "Articles publics administres",
      icon: FileText,
      accent: "info",
      href: "/admin/cms",
    },
    {
      key: "medicines",
      label: "Medicaments",
      value: counts.medicines,
      helper: "Referentiel expose au frontend",
      icon: Pill,
      accent: "success",
      href: "/admin/cdss/medicines",
    },
    {
      key: "pendingContributions",
      label: "Contributions a valider",
      value: counts.pendingContributions,
      helper: "Demandes docteur en attente",
      icon: GitPullRequest,
      accent: counts.pendingContributions > 0 ? "warning" : "muted",
      href: "/admin/cdss/medicine-contributions",
    },
    {
      key: "audits",
      label: "Entrees audit",
      value: counts.audits,
      helper: "Historique des prescriptions CDSS",
      icon: ScrollText,
      accent: "muted",
      href: "/admin/cdss/audit",
    },
  ], [counts]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [doctors, posts, medicines, contributions, audits] = await Promise.all([
          listDoctors(),
          listCmsPosts(),
          listMedicines(),
          listMedicineContributions(),
          listAuditEntries(),
        ]);

        setCounts({
          doctors: doctors.length,
          posts: posts.length,
          medicines: medicines.length,
          pendingContributions: contributions.filter((contribution) => contribution.status === "pending").length,
          audits: audits.length,
        });
        setAuditEntries(audits.slice(0, 6));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("adminDashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {today} - {t("adminDashboard.platformAdmin")}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          Backend NestJS synchronise
        </span>
      </div>

      {loading ? (
        <LoadingState
          title="Chargement administration"
          subtitle="Synchronisation des donnees admin depuis NestJS..."
        />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;

              return (
                <Link
                  key={kpi.key}
                  href={kpi.href}
                  className="rounded-xl border border-border bg-card p-4 shadow-card transition-smooth hover:shadow-elevated"
                >
                  <div className="flex items-start justify-between">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[kpi.accent]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-4 text-3xl font-bold tracking-tight">{kpi.value}</div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{kpi.label}</div>
                  <div className="text-[11px] text-muted-foreground/80 mt-2">{kpi.helper}</div>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold">Activite audit recente</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Les lignes ci-dessous viennent de l'endpoint audit NestJS.
                  </p>
                </div>
                <Link href="/admin/cdss/audit" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                  Voir tout <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {auditEntries.length ? (
                <ul className="divide-y divide-border">
                  {auditEntries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-smooth">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Activity className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{entry.prescriptionId} - {entry.finalStatus}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[entry.patient, entry.doctor, entry.recommendation].filter(Boolean).join(" - ")}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{entry.timestamp}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-sm text-muted-foreground">
                  Aucune entree audit disponible pour le moment.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-base font-semibold">Actions admin disponibles</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uniquement les modules presents dans la solution actuelle.
                </p>
              </div>
              <div className="p-3 space-y-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted transition-smooth"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{action.label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{action.description}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
