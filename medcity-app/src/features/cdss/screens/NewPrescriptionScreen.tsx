import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Brain, CheckCircle2, FileText, RefreshCw, Save, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import {
  getPatientAge,
  getPatientFullName,
  getPatientGenderLabel,
  getPatientSearchText,
  safetyAlerts as mockSafetyAlerts,
  type Medication,
  type Patient,
  type SafetyAlert,
} from "@/lib/mock-data";
import { PatientSummary } from "@/features/cdss/components/PatientSummary";
import { SafetyPanel } from "@/features/cdss/components/SafetyPanel";
import { useToast } from "@/hooks/use-toast";
import { PrescriptionMedicationRow } from "@/features/cdss/components/PrescriptionMedicationRow";
import { useI18n } from "@/i18n/I18nProvider";
import { mapCdssMedications, mapCdssSafetyAlerts, requestCdssDraft } from "@/lib/cdss-api";
import { listPatients, rejectPrescription, savePrescription, validatePrescription } from "@/lib/backend-api";

export default function NewPrescription({ basePath = "/admin/cdss" }: { basePath?: string }) {
  const { t } = useI18n();
  const [location] = useLocation();
  const initialPatientId = new URLSearchParams(location.split("?")[1] ?? "").get("patientId");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [meds, setMeds] = useState<Medication[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [caseStatus, setCaseStatus] = useState<"draft" | "pending_review" | "validated" | "rejected">("draft");
  const [savedPrescriptionId, setSavedPrescriptionId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      try {
        setPatients(await listPatients());
      } catch (error) {
        toast({
          title: "Patients indisponibles",
          description: error instanceof Error ? error.message : "Impossible de charger le backend.",
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!initialPatientId || selectedPatient) return;
    const patientFromUrl = patients.find((patient) => patient.id === initialPatientId);
    if (patientFromUrl) {
      setSelectedPatient(patientFromUrl);
      setPatientQuery(getPatientFullName(patientFromUrl));
    }
  }, [initialPatientId, patients, selectedPatient]);

  const patientResults = useMemo(() => {
    const needle = patientQuery.trim().toLowerCase();
    if (!needle) return patients.slice(0, 6);
    return patients.filter((patient) => getPatientSearchText(patient).includes(needle)).slice(0, 8);
  }, [patientQuery, patients]);

  const generate = async () => {
    if (!selectedPatient) {
      toast({
        title: t("rx.selectPatientToastTitle"),
        description: t("rx.selectPatientToastDescription"),
      });
      return;
    }
    setGenerating(true);
    try {
      const result = await requestCdssDraft({
        patient: selectedPatient,
        diagnosis,
        notes,
        save: false,
      });
      const aiMeds = mapCdssMedications(result);
      setMeds(aiMeds);
      setAlerts(mapCdssSafetyAlerts(result));
      setGenerated(true);
      setCaseStatus("pending_review");
      toast({
        title: t("rx.proposalGeneratedTitle"),
        description: `${t("rx.proposalGeneratedDescription", { patient: getPatientFullName(selectedPatient) })}${result.ia?.trace_id ? ` Trace IA: ${result.ia.trace_id}` : ""}`,
      });
    } catch (error) {
      setMeds([]);
      setAlerts(mockSafetyAlerts);
      setGenerated(true);
      setCaseStatus("pending_review");
      toast({
        title: "CDSS indisponible",
        description: error instanceof Error ? error.message : "Fallback sur la proposition de démonstration.",
      });
    } finally {
      setGenerating(false);
    }
  };

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setPatientQuery(getPatientFullName(patient));
    setGenerated(false);
    setMeds([]);
    setAlerts([]);
    setCaseStatus("draft");
    setSavedPrescriptionId(null);
  }

  const updateMed = (id: string, patch: Partial<Medication>) =>
    setMeds((current) => current.map((med) => (med.id === id ? { ...med, ...patch, status: "edited" } : med)));

  const removeMed = (id: string) => setMeds((current) => current.filter((med) => med.id !== id));

  const hasMissingData = !!selectedPatient?.missingData?.length;
  const isRejected = caseStatus === "rejected";

  const summaryLabel = useMemo(() => {
    if (caseStatus === "validated") return t("rx.status.validated");
    if (caseStatus === "rejected") return t("rx.status.rejected");
    if (caseStatus === "draft") return t("rx.status.draft");
    return t("rx.status.awaiting");
  }, [caseStatus, t]);

  const summaryTone =
    caseStatus === "validated"
      ? "bg-success-soft text-success border-success/30"
      : caseStatus === "rejected"
        ? "bg-critical-soft text-critical border-critical/30"
        : caseStatus === "draft"
          ? "bg-warning-soft text-warning-foreground border-warning/30"
          : "bg-info-soft text-info border-info/30";

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("rx.newTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("rx.newSubtitle")}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("rx.caseModel", { id: savedPrescriptionId ?? "Nouveau" })}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{t("rx.patientSelection")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("rx.patientSelectionHelp")}</p>
          </div>
          {selectedPatient && (
            <button
              onClick={() => {
                setSelectedPatient(null);
                setPatientQuery("");
                    setGenerated(false);
                    setMeds([]);
                    setAlerts([]);
                    setCaseStatus("draft");
                    setSavedPrescriptionId(null);
              }}
              className="rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              {t("rx.changePatient")}
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
          <div>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={patientQuery}
                onChange={(event) => {
                  setPatientQuery(event.target.value);
                  if (selectedPatient && event.target.value !== getPatientFullName(selectedPatient)) setSelectedPatient(null);
                }}
                placeholder={t("rx.searchPatient")}
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            {!selectedPatient && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-1">
                {patientResults.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => selectPatient(patient)}
                    className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="block font-semibold">{getPatientFullName(patient)}</span>
                      <span className="text-xs text-muted-foreground">
                        {patient.id} · {getPatientAge(patient)} {t("patients.ageUnit")} · {getPatientGenderLabel(patient)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{t("rx.conditionsCount", { count: patient.comorbidities.length })}</span>
                  </button>
                ))}
                {patientResults.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t("rx.noPatientFound")}</div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            {selectedPatient ? (
              <div>
                <div className="font-semibold">{getPatientFullName(selectedPatient)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedPatient.id} · {getPatientAge(selectedPatient)} {t("patients.ageUnit")} · {getPatientGenderLabel(selectedPatient)}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedPatient.flags.length === 0 ? (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">{t("rx.noActiveFlags")}</span>
                  ) : (
                    selectedPatient.flags.map((flag) => (
                      <span key={flag} className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                        {flag}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("rx.noPatientSelected")}</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 lg:sticky lg:top-20 self-start">
          {selectedPatient ? (
            <PatientSummary patient={selectedPatient} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              {t("rx.patientSummaryAfterSelection")}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <h2 className="text-sm font-semibold mb-3">{t("rx.clinicalContext")}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{t("rx.diagnosis")}</label>
                <input
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value.slice(0, 200))}
                  maxLength={200}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                  placeholder={t("rx.diagnosisPlaceholder")}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">{t("rx.clinicalNotes")}</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
                  maxLength={1000}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20 resize-none"
                  placeholder={t("rx.clinicalNotesPlaceholder")}
                />
              </div>
              <button
                onClick={generate}
                disabled={generating || !selectedPatient || !diagnosis.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
              >
                <Sparkles className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                {generating ? t("rx.generating") : t("rx.generate")}
              </button>
            </div>
          </div>

          {generated && selectedPatient && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">{t("rx.aiProposal")}</h2>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${summaryTone}`}>
                      {summaryLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t("rx.editableHelp")}</p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {meds.map((med) => (
                  <PrescriptionMedicationRow key={med.id} med={med} onChange={(patch) => updateMed(med.id, patch)} onRemove={() => removeMed(med.id)} />
                ))}
                {meds.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {t("rx.noMedication")}
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-border bg-muted/30 flex flex-wrap gap-2">
                <button onClick={generate} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth">
                  <RefreshCw className="h-3.5 w-3.5" /> {t("rx.regenerate")}
                </button>
                <button
                  onClick={() => {
                    void (async () => {
                      if (!selectedPatient) return;
                      try {
                        const saved = await savePrescription({
                          patientId: selectedPatient.id,
                          diagnosis,
                          notes,
                          medications: meds,
                        });
                        setSavedPrescriptionId(saved.id);
                        setCaseStatus("draft");
                        toast({
                          title: t("rx.draftSavedTitle"),
                          description: t("rx.draftSavedDescription"),
                        });
                      } catch (error) {
                        toast({
                          title: "Brouillon non enregistre",
                          description: error instanceof Error ? error.message : "Impossible de joindre le backend.",
                        });
                      }
                    })();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth"
                >
                  <Save className="h-3.5 w-3.5" /> {t("rx.saveDraft")}
                </button>
                <button
                  onClick={() => {
                    void (async () => {
                      try {
                        if (savedPrescriptionId) await rejectPrescription(savedPrescriptionId);
                        setCaseStatus("rejected");
                        setGenerated(false);
                        setAlerts([]);
                        toast({
                          title: t("rx.rejectedTitle"),
                          description: t("rx.rejectedDescription"),
                        });
                      } catch (error) {
                        toast({
                          title: "Rejet non enregistre",
                          description: error instanceof Error ? error.message : "Impossible de joindre le backend.",
                        });
                      }
                    })();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-critical/40 text-critical bg-card px-3 py-2 text-xs font-semibold hover:bg-critical-soft transition-smooth"
                >
                  <X className="h-3.5 w-3.5" /> {t("rx.rejectProposal")}
                </button>
                <div className="ml-auto flex gap-2">
                  <button
                    disabled={hasMissingData || isRejected}
                    onClick={() => {
                      void (async () => {
                        if (!selectedPatient) return;
                        try {
                          const saved = savedPrescriptionId
                            ? await validatePrescription(savedPrescriptionId)
                            : await savePrescription({
                                patientId: selectedPatient.id,
                                diagnosis,
                                notes,
                                medications: meds.map((med) => ({ ...med, status: "validated" })),
                              });
                          if (!savedPrescriptionId) await validatePrescription(saved.id);
                          setSavedPrescriptionId(saved.id);
                          setCaseStatus("validated");
                          setMeds((current) => current.map((med) => ({ ...med, status: "validated" })));
                          toast({
                            title: t("rx.validatedTitle"),
                            description: t("rx.validatedDescription"),
                          });
                        } catch (error) {
                          toast({
                            title: "Validation non enregistree",
                            description: error instanceof Error ? error.message : "Impossible de joindre le backend.",
                          });
                        }
                      })();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-semibold text-success-foreground shadow-card hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
                    title={hasMissingData ? t("rx.resolveMissingFirst") : isRejected ? t("rx.generateBeforeValidate") : ""}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> {t("rx.validate")}
                  </button>
                  <Link
                    href={`${basePath}/prescription/${savedPrescriptionId ?? "new"}/ordonnance?patientId=${encodeURIComponent(selectedPatient.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft text-primary px-3 py-2 text-xs font-semibold hover:bg-primary-soft/70 transition-smooth"
                  >
                    <FileText className="h-3.5 w-3.5" /> {t("rx.generateDocument")}
                  </Link>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-border bg-warning-soft/40 text-[11px] text-warning-foreground flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("rx.responsibility")}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 lg:sticky lg:top-20 self-start">
          <SafetyPanel alerts={selectedPatient ? (alerts.length ? alerts : mockSafetyAlerts) : []} />
        </div>
      </div>
    </div>
  );
}

export { CheckCircle2 };
