import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  Mic,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
} from "lucide-react";

import { ConsultationFormDialog } from "@/features/cdss/components/ConsultationFormDialog";
import { useI18n } from "@/i18n/I18nProvider";
import { deleteConsultation, listConsultations } from "@/lib/backend-api";
import type { Consultation, ConsultationStatus } from "@/lib/stores/consultation-store";
import { CardSkeletonGrid } from "@/components/molecules/LoadingState";

const statusMeta: Record<ConsultationStatus, { labelKey: string; cls: string }> = {
  scheduled: { labelKey: "consultations.status.scheduled", cls: "bg-info-soft text-info border-info/30" },
  in_progress: { labelKey: "consultations.status.inProgress", cls: "bg-warning-soft text-warning-foreground border-warning/30" },
  completed: { labelKey: "consultations.status.completed", cls: "bg-success-soft text-success border-success/30" },
  cancelled: { labelKey: "consultations.status.cancelled", cls: "bg-muted text-muted-foreground border-border" },
};

export default function ConsultationsPage({ basePath = "/doctor" }: { basePath?: "/doctor" }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConsultationStatus | "all">("all");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setConsultations(await listConsultations());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => consultations.filter((consultation) => {
    if (filter !== "all" && consultation.status !== filter) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      consultation.patientName.toLowerCase().includes(needle) ||
      consultation.reason.toLowerCase().includes(needle)
    );
  }), [consultations, filter, query]);

  async function handleDelete(id: string) {
    await deleteConsultation(id);
    setConfirmDelete(null);
    await refresh();
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("consultations.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("consultations.subtitle")}</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth"
        >
          <Plus className="h-4 w-4" /> {t("consultations.new")}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("consultations.searchPlaceholder")}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {(["all", "scheduled", "in_progress", "completed", "cancelled"] as const).map((status) => (
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
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <CardSkeletonGrid />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Stethoscope className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            {t("consultations.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((consultation) => {
              const status = statusMeta[consultation.status];
              const detailHref = `${basePath}/consultations/${consultation.id}`;

              return (
                <li key={consultation.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-smooth">
                  <Link href={detailHref} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                        {t(status.labelKey)}
                      </span>
                      {consultation.recordingDurationSec ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Mic className="h-3 w-3" /> {Math.round(consultation.recordingDurationSec / 60)} min
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-medium text-sm">
                      {consultation.patientName} - {consultation.reason}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <CalendarClock className="h-3 w-3" />
                      {new Date(consultation.scheduledAt).toLocaleString("fr-FR")} - {consultation.doctor}
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(consultation.id)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("common.edit")}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setConfirmDelete(consultation.id)} className="rounded-md p-2 text-muted-foreground hover:bg-critical-soft hover:text-critical" aria-label={t("common.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => setLocation(detailHref)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t("common.open")}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing !== null && (
        <ConsultationFormDialog
          open
          onClose={() => {
            setEditing(null);
            void refresh();
          }}
          editingId={editing === "new" ? undefined : editing}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-elevated p-5">
            <h3 className="font-semibold">{t("consultations.deleteTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("consultations.deleteDescription")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void handleDelete(confirmDelete)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-critical text-critical-foreground px-3 py-2 text-sm font-semibold hover:bg-critical/90"
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
