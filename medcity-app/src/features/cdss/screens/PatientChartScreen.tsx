import { Link, useParams } from "wouter";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, ClipboardCheck, FilePlus2, Pill, ShieldCheck } from "lucide-react";
import { PatientSummary } from "@/features/cdss/components/PatientSummary";
import { getPatientFullName, type Patient, type PrescriptionCase } from "@/lib/mock-data";
import { riskMeta, statusMeta } from "@/lib/clinical-ui";
import { PatientMetric as Metric } from "@/features/cdss/components/PatientMetric";
import { getPatient, listPrescriptions } from "@/lib/backend-api";
import { LoadingState } from "@/components/molecules/LoadingState";

export default function PatientChart({ basePath }: { basePath: "/doctor" }) {
  const params = useParams<{ id?: string; patientId?: string }>();
  const patientId = params.id ?? params.patientId;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientCases, setPatientCases] = useState<PrescriptionCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      setLoading(true);
      try {
        const [patientResult, prescriptionsResult] = await Promise.allSettled([
          getPatient(patientId),
          listPrescriptions({ patientId }),
        ]);
        const prescriptions = prescriptionsResult.status === "fulfilled" ? prescriptionsResult.value : [];
        const fallbackPatient = prescriptions.find((entry) => entry.patient)?.patient ?? null;
        const apiPatient = patientResult.status === "fulfilled" ? patientResult.value : fallbackPatient;
        setPatient(apiPatient ?? null);
        setPatientCases(prescriptions);
      } catch {
        setPatient(null);
        setPatientCases([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <LoadingState
          title="Chargement patient"
          subtitle="Recuperation du dossier patient depuis le backend..."
        />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <h1 className="text-xl font-semibold">Patient not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">The patient record is not available from the backend.</p>
          <Link href={`${basePath}/patients`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to patients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`${basePath}/patients`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-smooth">
            <ArrowLeft className="h-4 w-4" />
            Back to patients
          </Link>
          <h1 className="mt-3 text-2xl font-bold">{getPatientFullName(patient)}</h1>
          <p className="text-sm text-muted-foreground mt-1">Unified patient chart loaded from the NestJS backend.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/doctor/prescription/new?patientId=${encodeURIComponent(patient.id)}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth">
            <FilePlus2 className="h-4 w-4" />
            New prescription
          </Link>
          <Link href="/doctor/prescriptions" className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth">
            <ClipboardCheck className="h-4 w-4" />
            Review queue
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20 self-start">
          <PatientSummary patient={patient} />
        </div>

        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Clinical overview</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Snapshot of active issues that affect prescribing decisions.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3 p-5">
              <Metric icon={AlertTriangle} label="Risk flags" value={String(patient.flags.length)} note={patient.flags.length > 0 ? patient.flags.join(", ") : "No active flags"} />
              <Metric icon={Pill} label="Active medications" value={String(patient.currentMedications.length)} note={patient.currentMedications.length > 0 ? patient.currentMedications.map((med) => med.name).join(", ") : "No medications on file"} />
              <Metric icon={Activity} label="Comorbidities" value={String(patient.comorbidities.length)} note={patient.comorbidities.join(", ") || "No chronic conditions listed"} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Prescription cases</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Current and recent recommendation history for this patient.</p>
            </div>
            {patientCases.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No prescription cases available for this patient yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {patientCases.map((entry) => {
                  const status = statusMeta[entry.status];
                  const risk = riskMeta[entry.risk];
                  return (
                    <article key={entry.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-mono text-muted-foreground">{entry.id} · {entry.lastUpdate}</div>
                          <h3 className="mt-1 font-semibold">{entry.diagnosis}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{entry.doctor}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>{status.label}</span>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.cls}`}>{risk.label}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {entry.medications.map((med) => (
                          <div key={med.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                            <span className="font-medium">{med.name}</span>
                            <span className="text-muted-foreground">{med.dose} · {med.frequency} · {med.duration}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Monitoring checklist</h2>
            </div>
            <div className="p-5 grid gap-3 md:grid-cols-2">
              {[
                "Confirm current medication reconciliation before validating any new prescription.",
                "Review renal function when choosing renally-cleared antibiotics or anticoagulants.",
                "Address missing patient data before final validation when alerts block completion.",
                "Document any override rationale in the audit trail for compliance review.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
