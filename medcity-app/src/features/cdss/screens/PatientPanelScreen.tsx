import { Link, useLocation } from "wouter";

import { useEffect, useMemo, useState } from "react";
import { Search, AlertTriangle, FilePlus2, Plus, Pencil, Trash2, Eye, RefreshCw } from "lucide-react";
import { PatientFormDialog } from "@/features/cdss/components/PatientFormDialog";
import type { Patient } from "@/lib/mock-data";
import { getPatientAge, getPatientFullName, getPatientGenderLabel, getPatientInitials, getPatientSearchText } from "@/lib/mock-data";
import { useI18n } from "@/i18n/I18nProvider";
import { deletePatient, listPatients } from "@/lib/backend-api";
import { useToast } from "@/hooks/use-toast";
import { CardSkeletonGrid } from "@/components/molecules/LoadingState";


function PatientsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Patient | null>(null);

  async function refreshPatients() {
    setLoading(true);
    try {
      setPatients(await listPatients());
    } catch (error) {
      toast({
        title: "Patients indisponibles",
        description: error instanceof Error ? error.message : "Impossible de charger le backend.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshPatients();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => getPatientSearchText(p).includes(q));
  }, [patients, query]);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.patients")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("patients.panelCount", { count: patients.length })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm w-full sm:w-72">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("patients.searchPlaceholder")} className="flex-1 bg-transparent outline-none" />
          </div>
          <button onClick={() => void refreshPatients()} title="Rafraichir" className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-smooth">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { setEditing(null); setDialogOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth">
            <Plus className="h-4 w-4" /> {t("patients.new")}
          </button>
        </div>
      </div>

      {loading ? (
        <CardSkeletonGrid />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("patients.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-card transition-smooth hover:shadow-elevated">
              <div className="flex items-start justify-between">
                <Link href={`/doctor/patients/${p.id}`} className="flex items-center gap-3 group">
                  <div className="h-11 w-11 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold">
                    {getPatientInitials(p)}
                  </div>
                  <div>
                    <div className="font-semibold group-hover:text-primary transition-smooth">{getPatientFullName(p)}</div>
                    <div className="text-xs text-muted-foreground">{getPatientAge(p)} {t("patients.ageUnit")} - {getPatientGenderLabel(p)}</div>
                  </div>
                </Link>
                {p.missingData && p.missingData.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft text-warning-foreground px-2 py-0.5 text-[11px] font-semibold border border-warning/30">
                    <AlertTriangle className="h-3 w-3" /> {t("patients.dataBadge")}
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-muted-foreground">{t("patients.mobile")}</div>
                <div className="font-medium">{p.phone1 || t("common.notProvided")}</div>
                <div className="text-muted-foreground">{t("patients.profession")}</div>
                <div className="font-medium">{p.profession || t("common.notProvidedF")}</div>
                <div className="text-muted-foreground">{t("patients.internalCode")}</div>
                <div className="font-medium">{p.internalCode || t("common.notProvided")}</div>
              </div>

              {p.flags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.flags.map((f) => (
                    <span key={f} className="inline-flex items-center rounded-full bg-warning-soft text-warning-foreground border border-warning/30 px-2 py-0.5 text-[11px] font-medium">{f}</span>
                  ))}
                </div>
              )}

              <div className="mt-5 grid grid-cols-4 gap-2">
                <button onClick={() => setLocation(`/doctor/prescription/new?patientId=${encodeURIComponent(p.id)}`)} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth">
                  <FilePlus2 className="h-3.5 w-3.5" /> {t("patients.newRx")}
                </button>
                <Link href={`/doctor/patients/${p.id}`} className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-2 py-2 text-xs font-semibold hover:bg-muted transition-smooth" title={t("patients.openChart")}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(p); setDialogOpen(true); }} className="flex-1 inline-flex items-center justify-center rounded-lg border border-input bg-card px-2 py-2 text-xs font-semibold hover:bg-muted transition-smooth" title={t("common.edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(p)} className="flex-1 inline-flex items-center justify-center rounded-lg border border-critical/30 bg-card px-2 py-2 text-xs font-semibold text-critical hover:bg-critical-soft transition-smooth" title={t("common.delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PatientFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        onSaved={(saved) => {
          setPatients((current) => {
            const exists = current.some((patient) => patient.id === saved.id);
            return exists
              ? current.map((patient) => (patient.id === saved.id ? saved : patient))
              : [saved, ...current];
          });
        }}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-elevated p-5">
            <h3 className="font-semibold">{t("patients.deleteTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {t("patients.deleteDescription", { name: getPatientFullName(confirmDelete), id: confirmDelete.id })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
              <button onClick={() => {
                void (async () => {
                  try {
                    await deletePatient(confirmDelete.id);
                    setPatients((current) => current.filter((p) => p.id !== confirmDelete.id));
                    setConfirmDelete(null);
                  } catch (error) {
                    toast({
                      title: "Suppression impossible",
                      description: error instanceof Error ? error.message : "Impossible de joindre le backend.",
                    });
                  }
                })();
              }} className="inline-flex items-center gap-1.5 rounded-lg bg-critical text-critical-foreground px-3 py-2 text-sm font-semibold hover:bg-critical/90">
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientsPage;

