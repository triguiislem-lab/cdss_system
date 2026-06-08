import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, FilePlus2, Filter, RefreshCw } from "lucide-react";
import { getPatientAge, getPatientFullName, type Patient, type PrescriptionCase } from "@/lib/mock-data";
import { riskMeta, statusMeta } from "@/lib/clinical-ui";
import { useI18n } from "@/i18n/I18nProvider";
import { listPatients, listPrescriptions } from "@/lib/backend-api";

export default function PrescriptionReview({ basePath = "/admin/cdss" }: { basePath?: string }) {
  const { t } = useI18n();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionCase[]>([]);
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [patientsResult, prescriptionsResult] = await Promise.allSettled([
        listPatients(),
        listPrescriptions(),
      ]);
      const nextPatients = patientsResult.status === "fulfilled" ? patientsResult.value : [];
      const nextPrescriptions = prescriptionsResult.status === "fulfilled" ? prescriptionsResult.value : [];
      setPatients(nextPatients);
      setPrescriptions(nextPrescriptions);
      const errors = [
        patientsResult.status === "rejected" ? "patients" : null,
        prescriptionsResult.status === "rejected" ? "prescriptions" : null,
      ].filter(Boolean);
      setError(errors.length ? `Unable to load ${errors.join(" and ")}.` : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const visiblePrescriptions = useMemo(
    () => prescriptions.filter((entry) => (showHighRiskOnly ? entry.risk === "high" : true)),
    [prescriptions, showHighRiskOnly],
  );
  const hasAnyPrescriptions = prescriptions.length > 0;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("prescriptions.reviewTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("prescriptions.reviewSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void loadQueue()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
          </button>
          <button
            onClick={() => setShowHighRiskOnly((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
          >
            <Filter className="h-4 w-4" /> {t("prescriptions.filters")}
          </button>
          <Link
            href={`${basePath}/prescription/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth"
          >
            <FilePlus2 className="h-4 w-4" /> {t("nav.newPrescription")}
          </Link>
        </div>
      </div>

      {showHighRiskOnly && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-2 text-xs font-medium text-warning-foreground">
          {t("prescriptions.highRiskOnly")}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t("prescriptions.loadError")} {error}
          </span>
          <button onClick={() => void loadQueue()} className="rounded-md border border-critical/30 bg-card px-3 py-1.5 text-xs font-semibold hover:bg-critical-soft">
            {t("common.retry")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card shadow-card p-5">
              <div className="flex justify-between gap-3">
                <div className="w-full space-y-2">
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
                  <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-8 rounded-md bg-muted animate-pulse" />
                <div className="h-8 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : visiblePrescriptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <FilePlus2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold">
            {showHighRiskOnly && hasAnyPrescriptions ? t("prescriptions.highRiskEmptyTitle") : t("prescriptions.emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {showHighRiskOnly && hasAnyPrescriptions ? t("prescriptions.highRiskEmptyDescription") : t("prescriptions.emptyDescription")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {showHighRiskOnly && hasAnyPrescriptions ? (
              <button
                onClick={() => setShowHighRiskOnly(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
              >
                {t("common.all")}
              </button>
            ) : (
              <Link
                href={`${basePath}/prescription/new`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth"
              >
                <FilePlus2 className="h-4 w-4" /> {t("nav.newPrescription")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visiblePrescriptions.map((entry) => {
            const patient = entry.patient ?? patients.find((item) => item.id === entry.patientId);
            const status = statusMeta[entry.status] ?? statusMeta.draft;
            const risk = riskMeta[entry.risk] ?? riskMeta.low;
            const diagnosisText =
              entry.diagnosis ||
              Array.from(new Set(entry.medications.map((med) => med.indication?.trim()).filter(Boolean))).join(", ") ||
              t("prescriptions.noDiagnosis");

            return (
              <div key={entry.id} className="rounded-xl border border-border bg-card shadow-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{entry.lastUpdate}</div>
                    <div className="font-semibold mt-0.5">
                      {patient ? getPatientFullName(patient) : entry.patientId}{" "}
                      {patient && <span className="text-muted-foreground font-normal">({getPatientAge(patient)} {t("patients.ageUnit")})</span>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{diagnosisText}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>{status.label}</span>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.cls}`}>{risk.label}</span>
                  </div>
                </div>

                {entry.medications.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {entry.medications.map((med) => (
                      <li key={med.id} className="flex justify-between gap-3 text-xs rounded-md bg-muted/50 px-2.5 py-1.5">
                        <span className="font-medium">{med.name || t("prescriptions.unnamedMedication")}</span>
                        <span className="text-muted-foreground text-right">{[med.dose, med.frequency, med.duration].filter(Boolean).join(" - ")}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{entry.doctor}</div>
                  <Link
                    href={`${basePath}/prescription/${encodeURIComponent(entry.id)}/review`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth"
                  >
                    {t("common.open")} <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
