import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { AuditEntry } from "@/lib/mock-data";
import { statusMeta } from "@/lib/clinical-ui";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/I18nProvider";
import { listAuditEntries } from "@/lib/backend-api";
import { LoadingState } from "@/components/molecules/LoadingState";

export default function AuditPage() {
  const { t } = useI18n();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setAuditEntries(await listAuditEntries());
      } catch {
        setAuditEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return auditEntries;
    return auditEntries.filter((entry) =>
      [
        entry.prescriptionId,
        entry.patient,
        entry.doctor,
        entry.modelVersion,
        entry.recommendation,
        entry.doctorModification,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [auditEntries, query]);

  function exportAudit() {
    const header = [
      "prescriptionId",
      "patient",
      "doctor",
      "modelVersion",
      "recommendation",
      "doctorModification",
      "alertsOverridden",
      "finalStatus",
      "timestamp",
    ];
    const rows = visibleEntries.map((entry) => [
      entry.prescriptionId,
      entry.patient,
      entry.doctor,
      entry.modelVersion,
      entry.recommendation,
      entry.doctorModification,
      String(entry.alertsOverridden),
      entry.finalStatus,
      entry.timestamp,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
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
      description: t("audit.exportedDescription", { count: visibleEntries.length }),
    });
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("audit.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm w-64">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder={t("audit.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <button
            onClick={exportAudit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
          >
            <Download className="h-4 w-4" /> {t("audit.export")}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState
          title="Chargement audit"
          subtitle="Recuperation des traces de validation..."
        />
      ) : (
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
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
              {visibleEntries.map((entry) => {
                const status = statusMeta[entry.finalStatus] ?? statusMeta.draft;
                return (
                  <tr key={entry.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 font-medium">{entry.patient}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.doctor}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{entry.modelVersion}</td>
                    <td className="px-4 py-3 max-w-xs">{entry.recommendation}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div>{entry.doctorModification}</div>
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
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{entry.timestamp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
