import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { AuditEntry, PrescriptionStatus } from "@/lib/mock-data";
import { statusMeta } from "@/lib/clinical-ui";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/I18nProvider";
import {
  getAuditEntriesPage,
  getAuditSummary,
  type AuditSummary,
} from "@/lib/backend-api";
import { LoadingState } from "@/components/molecules/LoadingState";

const PAGE_SIZE = 20;
const statusOptions: Array<AuditEntry["finalStatus"]> = [
  "draft",
  "pending_review",
  "validated",
  "rejected",
  "cancelled",
];

export default function AuditPage() {
  const { t, language } = useI18n();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AuditEntry["finalStatus"] | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await getAuditEntriesPage({
            page,
            limit: PAGE_SIZE,
            search: query,
            status: statusFilter === "all" ? undefined : statusFilter,
          });
          if (!active) return;
          setAuditEntries(result.data);
          setTotalEntries(result.meta.total);
          setTotalPages(result.meta.totalPages);
        } catch (cause) {
          if (!active) return;
          setAuditEntries([]);
          setError(cause instanceof Error ? cause.message : "Impossible de charger le journal d’audit.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, query, reloadToken, statusFilter]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const result = await getAuditSummary();
        if (active) setSummary(result);
      } catch (cause) {
        if (active) setSummaryError(cause instanceof Error ? cause.message : "Résumé indisponible.");
      } finally {
        if (active) setSummaryLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  async function exportAudit() {
    setExporting(true);
    try {
      const filters = {
        search: query,
        status: statusFilter === "all" ? undefined : statusFilter,
      };
      const firstPage = await getAuditEntriesPage({ ...filters, page: 1, limit: 100 });
      const remainingPages = Array.from(
        { length: Math.max(0, firstPage.meta.totalPages - 1) },
        (_, index) => index + 2,
      );
      const remaining = await Promise.all(
        remainingPages.map((nextPage) => getAuditEntriesPage({ ...filters, page: nextPage, limit: 100 })),
      );
      const entries = [firstPage.data, ...remaining.map((result) => result.data)].flat();
      const header = [
        "prescriptionNumber",
        "patient",
        "doctor",
        "modelVersion",
        "recommendation",
        "doctorModification",
        "alertsOverridden",
        "overrideReason",
        "finalStatus",
        "timestamp",
      ];
      const rows = entries.map((entry) => [
        entry.prescriptionNumber ?? "Prescription non référencée",
        entry.patient,
        entry.doctor,
        entry.modelVersion,
        entry.recommendation,
        entry.doctorModification,
        String(entry.alertsOverridden),
        entry.overrideReason ?? "",
        entry.finalStatus,
        entry.timestamp,
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-log.csv";
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: t("audit.exportedTitle"),
        description: t("audit.exportedDescription", { count: entries.length }),
      });
    } catch (cause) {
      toast({
        title: "Export impossible",
        description: cause instanceof Error ? cause.message : "Les données d’audit sont indisponibles.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  const locale = language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN";
  const statusFilterLabel = statusFilter === "all" ? "Tous les statuts" : getStatusLabel(statusFilter, language);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Suivi des validations, décisions médicales et forçages enregistrés dans le journal backend.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm w-64">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Rechercher dans l’audit"
              placeholder={t("audit.searchPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Filtrer par statut</span>
            <select
              aria-label="Filtrer par statut"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as AuditEntry["finalStatus"] | "all");
                setPage(1);
              }}
              className="bg-transparent outline-none"
            >
              <option value="all">Tous les statuts</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{getStatusLabel(status, language)}</option>
              ))}
            </select>
          </label>
          <button
            onClick={exportAudit}
            disabled={loading || exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
          >
            <Download className="h-4 w-4" /> {exporting ? "Export en cours…" : t("audit.export")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <AuditMetric label="Entrées totales" value={summaryLoading ? "—" : summary?.total ?? "—"} icon={ShieldCheck} />
        <AuditMetric label="Validées" value={summaryLoading ? "—" : summary?.validated ?? "—"} tone="success" />
        <AuditMetric label="À revoir" value={summaryLoading ? "—" : summary?.pendingReview ?? "—"} tone="info" />
        <AuditMetric label="Avec forçage" value={summaryLoading ? "—" : summary?.overridden ?? "—"} tone="warning" />
        <AuditMetric
          label="Dernière activité"
          value={summary?.latestAt ? formatAuditDate(summary.latestAt, locale) : "—"}
          icon={Clock3}
          compact
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-card">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span>Source : {summary?.source ?? "journal audit NestJS"}</span>
        </div>
        <span>{totalEntries} entrée{totalEntries === 1 ? "" : "s"} correspondant{totalEntries === 1 ? "" : "s"} · filtre : {statusFilterLabel}</span>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>
          <button className="inline-flex items-center gap-1 font-semibold hover:underline" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" /> Réessayer
          </button>
        </div>
      )}
      {summaryError && !error && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Les indicateurs de synthèse sont momentanément indisponibles. Les lignes d’audit restent consultables.
        </div>
      )}

      {loading ? (
        <LoadingState title="Chargement audit" subtitle="Récupération des traces depuis NestJS…" />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("audit.rxId")}</th>
                  <th className="px-4 py-3 font-semibold">{t("common.patient")}</th>
                  <th className="px-4 py-3 font-semibold">{t("common.doctor")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.model")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.aiRecommendation")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.doctorModification")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.overrides")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.finalStatus")}</th>
                  <th className="px-4 py-3 font-semibold">{t("audit.timestamp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditEntries.length ? auditEntries.map((entry) => {
                  const status = statusMeta[entry.finalStatus] ?? statusMeta.draft;
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 align-top">
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-primary whitespace-nowrap">{entry.prescriptionNumber || "Prescription non référencée"}</td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{entry.patient || "Non renseigné"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{entry.doctor || "Non renseigné"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.modelVersion || "CDSS"}</td>
                      <td className="px-4 py-3 min-w-56 max-w-sm">{entry.recommendation || "Aucune recommandation enregistrée"}</td>
                      <td className="px-4 py-3 min-w-56 max-w-sm">
                        <div>{entry.doctorModification || "Aucune modification enregistrée"}</div>
                        {entry.overrideReason && (
                          <div className="mt-1 text-[11px] text-warning-foreground bg-warning-soft border border-warning/30 rounded px-2 py-1">
                            <span className="font-semibold">{t("audit.overrideReason")}</span> {entry.overrideReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.alertsOverridden > 0 ? (
                          <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-warning-soft text-warning-foreground border border-warning/30 px-1.5 text-xs font-semibold">
                            {entry.alertsOverridden}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                          {getStatusLabel(entry.finalStatus, language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatAuditDate(entry.timestamp, locale)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      Aucune entrée d’audit ne correspond aux filtres actuels.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">Page {page} sur {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                aria-label="Page précédente"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" /> Précédent
              </button>
              <button
                aria-label="Page suivante"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Suivant <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditMetric({
  label,
  value,
  icon: Icon = ShieldCheck,
  tone = "primary",
  compact = false,
}: {
  label: string;
  value: number | string;
  icon?: typeof ShieldCheck;
  tone?: "primary" | "success" | "info" | "warning";
  compact?: boolean;
}) {
  const toneClass = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className={`${compact ? "text-sm leading-5" : "text-2xl"} mt-3 font-bold tracking-tight`}>{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function getStatusLabel(status: PrescriptionStatus, language: "fr" | "en" | "ar") {
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

function formatAuditDate(value: string, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
