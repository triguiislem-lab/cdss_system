import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Filter } from "lucide-react";
import { getPatientAge, getPatientFullName, type Patient, type PrescriptionCase } from "@/lib/mock-data";
import { riskMeta, statusMeta } from "@/lib/clinical-ui";
import { useI18n } from "@/i18n/I18nProvider";
import { listPatients, listPrescriptions } from "@/lib/backend-api";

export default function PrescriptionReview({ basePath = "/admin/cdss" }: { basePath?: string }) {
  const { t } = useI18n();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionCase[]>([]);
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);

  useEffect(() => {
    void (async () => {
      const [apiPatients, apiPrescriptions] = await Promise.all([
        listPatients(),
        listPrescriptions(),
      ]);
      setPatients(apiPatients);
      setPrescriptions(apiPrescriptions);
    })();
  }, []);
  const visiblePrescriptions = useMemo(
    () => prescriptions.filter((entry) => (showHighRiskOnly ? entry.risk === "high" : true)),
    [showHighRiskOnly],
  );

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("prescriptions.reviewTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("prescriptions.reviewSubtitle")}</p>
        </div>
        <button
          onClick={() => setShowHighRiskOnly((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
        >
          <Filter className="h-4 w-4" /> {t("prescriptions.filters")}
        </button>
      </div>

      {showHighRiskOnly && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-2 text-xs font-medium text-warning-foreground">
          {t("prescriptions.highRiskOnly")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visiblePrescriptions.map((entry) => {
          const patient = patients.find((item) => item.id === entry.patientId);
          const status = statusMeta[entry.status];
          const risk = riskMeta[entry.risk];
          return (
            <div key={entry.id} className="rounded-xl border border-border bg-card shadow-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground font-mono">{entry.id} · {entry.lastUpdate}</div>
                  <div className="font-semibold mt-0.5">
                    {patient ? getPatientFullName(patient) : entry.patientId} {patient && <span className="text-muted-foreground font-normal">({getPatientAge(patient)} {t("patients.ageUnit")})</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{entry.diagnosis}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>{status.label}</span>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.cls}`}>{risk.label}</span>
                </div>
              </div>

              {entry.medications.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {entry.medications.map((med) => (
                    <li key={med.id} className="flex justify-between text-xs rounded-md bg-muted/50 px-2.5 py-1.5">
                      <span className="font-medium">{med.name}</span>
                      <span className="text-muted-foreground">{med.dose} · {med.frequency} · {med.duration}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{entry.doctor}</div>
                <Link
                  href={`${basePath}/prescription/new?patientId=${encodeURIComponent(entry.patientId)}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth"
                >
                  {t("common.open")} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
