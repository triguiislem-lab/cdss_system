import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  ExternalLink,
  FileText,
  Gauge,
  GitPullRequest,
  Mail,
  Pill,
  ScrollText,
  Send,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { statusMeta } from "@/lib/clinical-ui";
import { useI18n } from "@/i18n/I18nProvider";
import {
  getAuditEntriesPage,
  getAdminDashboardSummary,
  type AdminDashboardSummary,
} from "@/lib/backend-api";

type Accent = "info" | "success" | "warning" | "primary" | "muted";
type AuditEntry = Awaited<ReturnType<typeof getAuditEntriesPage>>["data"][number];

type KpiItem = {
  key: string;
  label: string;
  value: number | string;
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
    href: "/admin/contact-messages",
    label: "Messages contact",
    description: "Demandes publiques et messages envoyes par les docteurs.",
    icon: Mail,
  },
  {
    href: "/admin/newsletter",
    label: "Newsletter",
    description: "Abonnes et campagnes envoyees via Resend.",
    icon: Send,
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

const DEFAULT_GRAFANA_PATH = "/d/medcity-overview/medcity-overview?orgId=1&refresh=30s";

function getGrafanaUrl() {
  const configured = (import.meta.env.VITE_GRAFANA_URL as string | undefined)?.trim();
  if (configured) return configured;

  if (typeof window === "undefined") return "";
  return `${window.location.origin}/grafana${DEFAULT_GRAFANA_PATH}`;
}

export default function AdminDashboard() {
  const { t, language } = useI18n();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoadError, setAuditLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const grafanaUrl = getGrafanaUrl();

  const today = new Date().toLocaleDateString(
    language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  const kpis = useMemo<KpiItem[]>(() => summary ? [
    {
      key: "activeDoctors",
      label: "Médecins actifs",
      value: summary.doctors.active,
      helper: "Comptes geres dans NestJS",
      icon: UserCheck,
      accent: "primary",
      href: "/admin/doctors",
    },
    {
      key: "patients",
      label: "Patients suivis",
      value: summary.patients.total,
      helper: "Dossiers présents dans la base",
      icon: UserCheck,
      accent: "info",
      href: "/admin/cdss/audit",
    },
    {
      key: "pendingPrescriptions",
      label: "Prescriptions à revoir",
      value: summary.prescriptions.pendingReview,
      helper: "En attente de validation médicale",
      icon: ScrollText,
      accent: summary.prescriptions.pendingReview ? "warning" : "muted",
      href: "/admin/cdss/audit",
    },
    {
      key: "highRisk",
      label: "Prescriptions à risque élevé",
      value: summary.prescriptions.highRisk,
      helper: "Nécessitent une attention clinique",
      icon: Pill,
      accent: summary.prescriptions.highRisk ? "warning" : "success",
      href: "/admin/cdss/audit",
    },
    {
      key: "medicines",
      label: "Médicaments Firebase",
      value: summary.medicines.available && summary.medicines.total !== null ? summary.medicines.total : "—",
      helper: summary.medicines.available ? "Source de vérité du catalogue" : "Catalogue temporairement indisponible",
      icon: Pill,
      accent: summary.medicines.available ? "success" : "warning",
      href: "/admin/cdss/medicines",
    },
    {
      key: "newMessages",
      label: "Nouveaux messages",
      value: summary.contactMessages.new,
      helper: "Demandes à traiter par l’administration",
      icon: Mail,
      accent: summary.contactMessages.new ? "warning" : "muted",
      href: "/admin/contact-messages",
    },
  ] : [], [summary]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [dashboard, audits] = await Promise.allSettled([
          getAdminDashboardSummary(),
          getAuditEntriesPage({ page: 1, limit: 6 }),
        ]);
        if (dashboard.status === "fulfilled") setSummary(dashboard.value);
        else {
          setSummary(null);
          setLoadError("Impossible de charger les agrégats du tableau de bord.");
        }
        setAuditEntries(audits.status === "fulfilled" ? audits.value.data : []);
        setAuditLoadError(audits.status === "rejected");
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
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          summary && !loadError
            ? "border-success/30 bg-success-soft text-success"
            : "border-warning/30 bg-warning-soft text-warning-foreground"
        }`}>
          <span className={`h-2 w-2 rounded-full ${summary && !loadError ? "bg-success" : "bg-warning"}`} />
          {summary && !loadError ? "Données agrégées par NestJS" : "Données du tableau de bord indisponibles"}
        </span>
      </div>

      {loadError && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          {loadError} Aucun zéro n’est affiché comme valeur de remplacement : rechargez la page après vérification du backend.
        </div>
      )}

      {loading ? (
        <LoadingState
          title="Chargement administration"
          subtitle="Synchronisation des donnees admin depuis NestJS..."
        />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">
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

          {summary && (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h2 className="text-base font-semibold">File clinique</h2>
                <p className="mt-1 text-xs text-muted-foreground">État réel des prescriptions enregistrées.</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <SummaryValue label="Total" value={summary.prescriptions.total} />
                  <SummaryValue label="Brouillons" value={summary.prescriptions.drafts} />
                  <SummaryValue label="Validées" value={summary.prescriptions.validated} />
                  <SummaryValue label="Rejetées" value={summary.prescriptions.rejected} />
                  <SummaryValue label="Annulées" value={summary.prescriptions.cancelled} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h2 className="text-base font-semibold">Activité opérationnelle</h2>
                <p className="mt-1 text-xs text-muted-foreground">Consultations et demandes nécessitant un suivi.</p>
                  <div className="mt-4 space-y-2 text-sm">
                  <SummaryRow label="Prescriptions à risque élevé" value={summary.prescriptions.highRisk} href="/admin/cdss/audit" />
                  <SummaryRow label="Consultations à venir" value={summary.consultations.upcoming} />
                  <SummaryRow label="Contributions en attente" value={summary.contributions.pending} href="/admin/cdss/medicine-contributions" />
                  <SummaryRow label="Nouveaux messages" value={summary.contactMessages.new} href="/admin/contact-messages" />
                  <SummaryRow label="Abonnés newsletter actifs" value={summary.newsletter.active} href="/admin/newsletter" />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h2 className="text-base font-semibold">Contenu et traçabilité</h2>
                <p className="mt-1 text-xs text-muted-foreground">Couverture des modules administratifs.</p>
                <div className="mt-4 space-y-2 text-sm">
                  <SummaryRow label="Articles publiés" value={summary.cms.published} href="/admin/cms" />
                  <SummaryRow label="Articles en brouillon" value={summary.cms.draft} href="/admin/cms" />
                  <SummaryRow label="Entrées d’audit" value={summary.auditEntries} href="/admin/cdss/audit" />
                  <SummaryRow label="Consultations terminées" value={summary.consultations.completed} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h2 className="text-base font-semibold">Qualité et sources</h2>
                <p className="mt-1 text-xs text-muted-foreground">Indicateurs de couverture et fraîcheur des données.</p>
                <div className="mt-4 space-y-2 text-sm">
                  <SummaryRow label="Taux de validation" value={`${formatPercentage(summary.prescriptions.validated, summary.prescriptions.total)}%`} />
                  <SummaryRow label="Médecins actifs" value={`${summary.doctors.active}/${summary.doctors.total}`} href="/admin/doctors" />
                  <SummaryRow label="Catalogue médicaments" value={summary.medicines.source} href="/admin/cdss/medicines" />
                  <SummaryRow label="Dernière synchronisation" value={formatDashboardDate(summary.generatedAt, language)} />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold">Activite audit recente</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary?.auditEntries ?? 0} entrée(s) enregistrée(s) · les 6 dernières sont affichées.
                  </p>
                </div>
                <Link href="/admin/cdss/audit" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                  Voir tout <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {auditLoadError ? (
                <div className="p-8 text-sm text-warning-foreground bg-warning-soft">
                  Le journal d’audit est momentanément indisponible. Les indicateurs globaux restent issus de NestJS.
                </div>
              ) : auditEntries.length ? (
                <ul className="divide-y divide-border">
                  {auditEntries.map((entry) => {
                    const status = statusMeta[entry.finalStatus] ?? statusMeta.draft;
                    return (
                    <li key={entry.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-smooth">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Activity className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${status.cls}`}>
                            {getAuditStatusLabel(entry.finalStatus, language)}
                          </span>
                          <span className="font-mono text-xs text-primary">{entry.prescriptionNumber || "Prescription non référencée"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[entry.patient || "Patient non renseigné", entry.doctor || "Médecin non renseigné", entry.recommendation].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-[11px] text-muted-foreground whitespace-nowrap">{formatAuditDate(entry.timestamp, language)}</span>
                        {entry.alertsOverridden > 0 && <span className="text-[11px] text-warning-foreground">{entry.alertsOverridden} forçage(s)</span>}
                      </div>
                    </li>
                    );
                  })}
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
                <a
                  href={grafanaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted transition-smooth"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                    <Gauge className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      Monitoring Grafana
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Dashboards Prometheus: API, CDSS, EC2 CPU/RAM/disk et containers.
                    </span>
                  </span>
                </a>
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

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SummaryRow({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <span className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-smooth">
      <span className="text-muted-foreground">{label}</span>
      <strong>{value}</strong>
    </span>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function formatPercentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDashboardDate(value: string, language: "fr" | "en" | "ar") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function getAuditStatusLabel(status: AuditEntry["finalStatus"], language: "fr" | "en" | "ar") {
  if (language === "en") {
    return {
      draft: "Draft",
      pending_review: "Pending review",
      validated: "Validated",
      rejected: "Rejected",
      cancelled: "Cancelled",
    }[status];
  }
  if (language === "ar") {
    return {
      draft: "مسودة",
      pending_review: "قيد المراجعة",
      validated: "تمت المصادقة",
      rejected: "مرفوضة",
      cancelled: "ملغاة",
    }[status];
  }
  return {
    draft: "Brouillon",
    pending_review: "À revoir",
    validated: "Validée",
    rejected: "Rejetée",
    cancelled: "Annulée",
  }[status];
}

function formatAuditDate(value: string, language: "fr" | "en" | "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
