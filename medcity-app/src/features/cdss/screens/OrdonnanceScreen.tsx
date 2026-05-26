import { Link, useParams } from "wouter";
import { useState } from "react";
import { ArrowLeft, Building2, Printer, ShieldCheck, Stethoscope, User as UserIcon } from "lucide-react";
import { SendPrescriptionDialog } from "@/features/cdss/components/SendPrescriptionDialog";
import { getPatientAge, getPatientFullName, getPatientGenderLabel, prescriptions } from "@/lib/mock-data";
import { usePatientStore } from "@/lib/stores/patient-store";
import type { DispatchTarget } from "@/lib/stores/pharmacy-store";

export default function OrdonnancePage({ basePath = "/doctor" }: { basePath?: string }) {
  const params = useParams<{ rxId: string }>();
  const patientId = new URLSearchParams(window.location.search).get("patientId");
  const rx = prescriptions.find((prescription) => prescription.id === params.rxId);
  const fallbackPatientId = patientId ?? rx?.patientId;
  const patient = usePatientStore((state) => state.patients.find((entry) => entry.id === fallbackPatientId));
  const [sendOpen, setSendOpen] = useState<DispatchTarget | null>(null);

  if (!rx || !patient) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Prescription not found.</p>
        <Link href={`${basePath}/prescriptions`} className="inline-flex mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Back to queue
        </Link>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="p-4 lg:p-8 print:p-0">
      <div className="mx-auto max-w-3xl space-y-4 print:mx-0 print:max-w-none print:space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href={`${basePath}/patients/${patient.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to patient
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setSendOpen("pharmacist")} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
              <Building2 className="h-4 w-4" /> Envoyer au pharmacien
            </button>
            <button onClick={() => setSendOpen("patient")} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
              <UserIcon className="h-4 w-4" /> Envoyer au patient
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Printer className="h-4 w-4" /> Imprimer / PDF
            </button>
          </div>
        </div>

        <article data-print-root className="rounded-xl border border-border bg-card shadow-card p-8 print:shadow-none print:border-0 print:rounded-none print:bg-white print:text-black print:p-0">
          <header className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-6 w-6" />
              </span>
              <div>
                <div className="text-lg font-bold">MedCity - Ordonnance numerique</div>
                <div className="text-xs text-muted-foreground">Digital prescription - {rx.id}</div>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Date: <span className="text-foreground font-semibold">{today}</span></div>
              <div className="mt-0.5">Prescriber: <span className="text-foreground font-semibold">{rx.doctor}</span></div>
            </div>
          </header>

          <section className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Patient</div>
              <div className="mt-1 font-semibold">{getPatientFullName(patient)}</div>
              <div className="text-xs text-muted-foreground">
                {patient.id} - {getPatientAge(patient)} ans - {getPatientGenderLabel(patient)}
              </div>
              {patient.allergies.length > 0 && (
                <div className="mt-2 text-xs"><span className="font-semibold text-critical">Allergies:</span> {patient.allergies.join(", ")}</div>
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Diagnosis / indication</div>
              <div className="mt-1 font-medium">{rx.diagnosis}</div>
              {rx.notes && <div className="text-xs text-muted-foreground mt-1">{rx.notes}</div>}
            </div>
          </section>

          <section className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Prescription</div>
            <ol className="space-y-3">
              {rx.medications.map((medication, index) => (
                <li key={medication.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-semibold">{index + 1}. {medication.name}</div>
                    <div className="text-xs text-muted-foreground">{medication.indication}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <Cell label="Dose" value={medication.dose} />
                    <Cell label="Route" value={medication.route} />
                    <Cell label="Frequency" value={medication.frequency} />
                    <Cell label="Duration" value={medication.duration} />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <footer className="mt-8 border-t border-border pt-5 flex items-end justify-between">
            <div className="text-[11px] text-muted-foreground max-w-md flex items-start gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
              <span>This prescription was generated with AI assistance and explicitly validated by the prescribing clinician, who remains fully responsible.</span>
            </div>
            <div className="text-right">
              <div className="h-12 w-44 border-b border-foreground/40" />
              <div className="text-[11px] text-muted-foreground mt-1">Signature</div>
            </div>
          </footer>
        </article>
      </div>

      {sendOpen && (
        <SendPrescriptionDialog
          open
          onClose={() => setSendOpen(null)}
          rxId={rx.id}
          patientId={patient.id}
          patientName={getPatientFullName(patient)}
          defaultTarget={sendOpen}
        />
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

