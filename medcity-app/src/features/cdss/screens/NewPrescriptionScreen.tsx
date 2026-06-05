import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Brain, CheckCircle2, FileText, Plus, RefreshCw, Save, Search, ShieldCheck, Sparkles, X } from "lucide-react";
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
import { getMedicine, getPrescription, listMedicines, listPatients, rejectPrescription, savePrescription, updatePrescription, validatePrescription } from "@/lib/backend-api";
import type { TunisianMedicine } from "@/lib/tunisia-medicines";

export default function NewPrescription({ basePath = "/admin/cdss", prescriptionId }: { basePath?: string; prescriptionId?: string }) {
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const initialPatientId = new URLSearchParams(location.split("?")[1] ?? "").get("patientId");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [meds, setMeds] = useState<Medication[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [medicineOptionsByLine, setMedicineOptionsByLine] = useState<Record<string, TunisianMedicine[]>>({});
  const [medicineLoadingByLine, setMedicineLoadingByLine] = useState<Record<string, boolean>>({});
  const [selectedMedicineByLine, setSelectedMedicineByLine] = useState<Record<string, TunisianMedicine>>({});
  const [generated, setGenerated] = useState(false);
  const [manualStarted, setManualStarted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [patientsLoaded, setPatientsLoaded] = useState(false);
  const [caseStatus, setCaseStatus] = useState<"draft" | "pending_review" | "validated" | "rejected">("draft");
  const [savedPrescriptionId, setSavedPrescriptionId] = useState<string | null>(null);
  const [loadedPrescriptionId, setLoadedPrescriptionId] = useState<string | null>(null);
  const medicineSearchTimers = useRef<Record<string, number>>({});
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
      } finally {
        setPatientsLoaded(true);
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

  useEffect(() => {
    if (!prescriptionId || !patientsLoaded || loadedPrescriptionId === prescriptionId) return;
    void (async () => {
      try {
        const prescription = await getPrescription(prescriptionId);
        const patientFromPrescription = patients.find((patient) => patient.id === prescription.patientId);
        if (patientFromPrescription) {
          setSelectedPatient(patientFromPrescription);
          setPatientQuery(getPatientFullName(patientFromPrescription));
        } else {
          setPatientQuery(prescription.patientId);
        }
        setDiagnosis(prescription.diagnosis ?? "");
        setNotes(prescription.notes ?? "");
        setMeds(prescription.medications);
        setAlerts([]);
        void hydrateSelectedMedicines(prescription.medications);
        setSavedPrescriptionId(prescription.id);
        setCaseStatus(prescription.status === "pending_review" || prescription.status === "validated" || prescription.status === "rejected" ? prescription.status : "draft");
        const isAiProposal = prescription.status === "pending_review" || prescription.medications.some((med) => med.status === "ai_proposed");
        setGenerated(isAiProposal);
        setManualStarted(!isAiProposal);
        setLoadedPrescriptionId(prescription.id);
      } catch (error) {
        toast({
          title: "Prescription indisponible",
          description: error instanceof Error ? error.message : "Impossible de charger cette prescription.",
        });
      }
    })();
  }, [loadedPrescriptionId, patients, patientsLoaded, prescriptionId, toast]);

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
      setManualStarted(false);
      setCaseStatus("pending_review");
      toast({
        title: t("rx.proposalGeneratedTitle"),
        description: `${t("rx.proposalGeneratedDescription", { patient: getPatientFullName(selectedPatient) })}${result.ia?.trace_id ? ` Trace IA: ${result.ia.trace_id}` : ""}`,
      });
    } catch (error) {
      setMeds([]);
      setAlerts(mockSafetyAlerts);
      setGenerated(true);
      setManualStarted(false);
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
    resetPrescriptionDraft();
  }

  function resetPrescriptionDraft() {
    setGenerated(false);
    setManualStarted(false);
    setMeds([]);
    setAlerts([]);
    setMedicineOptionsByLine({});
    setMedicineLoadingByLine({});
    setSelectedMedicineByLine({});
    setCaseStatus("draft");
    setSavedPrescriptionId(null);
  }

  const updateMed = (id: string, patch: Partial<Medication>) =>
    setMeds((current) => current.map((med) => (med.id === id ? { ...med, ...patch, status: "edited" } : med)));

  const removeMed = (id: string) => {
    setMeds((current) => current.filter((med) => med.id !== id));
    setMedicineOptionsByLine((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setMedicineLoadingByLine((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedMedicineByLine((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  function createManualMedication(): Medication {
    return {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      medicineId: undefined,
      name: "",
      dose: "",
      route: "PO",
      frequency: "",
      duration: "",
      indication: "",
      confidence: 0,
      status: "edited",
    };
  }

  function addManualMedication() {
    if (!selectedPatient) {
      toast({
        title: t("rx.selectPatientToastTitle"),
        description: t("rx.selectPatientToastDescription"),
      });
      return;
    }
    setGenerated(false);
    setManualStarted(true);
    setCaseStatus("draft");
    setAlerts([]);
    setMeds((current) => [...current, createManualMedication()]);
  }

  async function hydrateSelectedMedicines(lines: Medication[]) {
    const linesWithMedicineId = lines.filter((line) => line.medicineId);
    if (linesWithMedicineId.length === 0) return;
    const pairs = await Promise.all(
      linesWithMedicineId.map(async (line) => {
        try {
          return [line.id, await getMedicine(line.medicineId as string)] as const;
        } catch {
          return null;
        }
      }),
    );
    setSelectedMedicineByLine((current) => {
      const next = { ...current };
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1];
      }
      return next;
    });
  }

  function searchMedicinesForLine(lineId: string, query: string) {
    setSelectedMedicineByLine((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
    window.clearTimeout(medicineSearchTimers.current[lineId]);
    if (query.trim().length < 2) {
      setMedicineOptionsByLine((current) => ({ ...current, [lineId]: [] }));
      setMedicineLoadingByLine((current) => ({ ...current, [lineId]: false }));
      return;
    }
    setMedicineLoadingByLine((current) => ({ ...current, [lineId]: true }));
    medicineSearchTimers.current[lineId] = window.setTimeout(() => {
      void (async () => {
        try {
          const medicines = await listMedicines({ search: query, limit: 8 });
          setMedicineOptionsByLine((current) => ({ ...current, [lineId]: medicines }));
        } catch {
          setMedicineOptionsByLine((current) => ({ ...current, [lineId]: [] }));
        } finally {
          setMedicineLoadingByLine((current) => ({ ...current, [lineId]: false }));
        }
      })();
    }, 250);
  }

  function inferRouteFromMedicine(medicine: TunisianMedicine) {
    const source = [medicine.form, ...(medicine.forms ?? [])].join(" ").toLowerCase();
    if (source.includes("inject") || source.includes("iv") || source.includes("im")) return "Injection";
    if (source.includes("sirop") || source.includes("sachet") || source.includes("gel") || source.includes("cp") || source.includes("comprime")) return "PO";
    if (source.includes("collyre")) return "Ocular";
    if (source.includes("pommade") || source.includes("creme")) return "Topical";
    return "PO";
  }

  function selectMedicineForLine(lineId: string, medicine: TunisianMedicine) {
    const productName = medicine.localProductName || medicine.brands?.[0] || medicine.dci;
    const dose = [medicine.dosage, medicine.form || medicine.forms?.[0]].filter(Boolean).join(" - ");
    setSelectedMedicineByLine((current) => ({ ...current, [lineId]: medicine }));
    setMedicineOptionsByLine((current) => ({ ...current, [lineId]: [] }));
    updateMed(lineId, {
      medicineId: medicine.id,
      name: productName,
      dose,
      route: inferRouteFromMedicine(medicine),
      frequency: medicine.posologyAdult || "",
      indication: medicine.indication,
    });
  }

  const saveCurrentPrescription = async (statusPatch?: Partial<Medication>) => {
    if (!selectedPatient) {
      toast({
        title: t("rx.selectPatientToastTitle"),
        description: t("rx.selectPatientToastDescription"),
      });
      return null;
    }
    if (meds.length === 0) {
      toast({
        title: t("rx.cannotSaveTitle"),
        description: t("rx.addMedicationFirst"),
      });
      return null;
    }
    if (meds.some((med) => !med.name.trim())) {
      toast({
        title: t("rx.cannotSaveTitle"),
        description: t("rx.medicineNameRequired"),
      });
      return null;
    }
    if (!generated && meds.some((med) => !med.medicineId)) {
      toast({
        title: t("rx.cannotSaveTitle"),
        description: t("rx.selectMedicineFromCatalog"),
      });
      return null;
    }
    const payload = {
      patientId: selectedPatient.id,
      diagnosis,
      notes,
      medications: meds.map((med) => ({ ...med, ...statusPatch })),
    };
    const saved = savedPrescriptionId
      ? await updatePrescription(savedPrescriptionId, payload)
      : await savePrescription(payload);
    setSavedPrescriptionId(saved.id);
    return saved;
  };

  const openOrdonnance = async () => {
    if (!selectedPatient) return;
    try {
      const saved = await saveCurrentPrescription();
      if (!saved) return;
      setLocation(`${basePath}/prescription/${saved.id}/ordonnance?patientId=${encodeURIComponent(selectedPatient.id)}`);
    } catch (error) {
      toast({
        title: "Ordonnance non disponible",
        description: error instanceof Error ? error.message : "Impossible de preparer le document.",
      });
    }
  };

  const hasMissingData = !!selectedPatient?.missingData?.length;
  const isRejected = caseStatus === "rejected";
  const hasMedicationLines = meds.length > 0;
  const hasMedicationWithoutName = meds.some((med) => !med.name.trim());
  const showPrescriptionEditor = !!selectedPatient && (generated || manualStarted || hasMedicationLines || !!savedPrescriptionId);
  const isManualPrescription = showPrescriptionEditor && !generated;
  const hasManualMedicationWithoutCatalog = isManualPrescription && meds.some((med) => !med.medicineId);

  const summaryLabel = useMemo(() => {
    if (caseStatus === "validated") return t("rx.status.validated");
    if (caseStatus === "rejected") return t("rx.status.rejected");
    if (caseStatus === "draft") return savedPrescriptionId ? t("rx.status.draft") : t("rx.status.manualDraft");
    return t("rx.status.awaiting");
  }, [caseStatus, savedPrescriptionId, t]);

  const summaryTone =
    caseStatus === "validated"
      ? "bg-success-soft text-success border-success/30"
      : caseStatus === "rejected"
        ? "bg-critical-soft text-critical border-critical/30"
        : caseStatus === "draft"
          ? "bg-warning-soft text-warning-foreground border-warning/30"
          : "bg-info-soft text-info border-info/30";

  const tnMedicineSafetyAlerts = useMemo<SafetyAlert[]>(() => {
    return Object.entries(selectedMedicineByLine).flatMap(([lineId, medicine]) => {
      const productName = medicine.localProductName || medicine.brands?.[0] || medicine.dci;
      const source = medicine.sourceReference || "TN Med local medicine catalog";
      const medicineAlerts: SafetyAlert[] = [];
      if (medicine.contraindications.length > 0) {
        medicineAlerts.push({
          id: `tn-med-contra-${lineId}`,
          severity: "major",
          title: `Contraindications - ${productName}`,
          drugsInvolved: [productName],
          explanation: medicine.contraindications.join("; "),
          recommendedAction: "Review these contraindications against the patient context before signing the prescription.",
          evidence: source,
        });
      }

      const pregnancy = medicine.pregnancy || "";
      const pregnancyText = pregnancy.toLowerCase();
      const pregnancySeverity = pregnancyText.includes("contre") ? "major" : pregnancyText.includes("prec") ? "moderate" : "info";
      medicineAlerts.push({
        id: `tn-med-pregnancy-${lineId}`,
        severity: pregnancySeverity,
        title: `Pregnancy - ${productName}: ${pregnancy}`,
        drugsInvolved: [productName],
        explanation: `TN Med pregnancy status: ${pregnancy}.`,
        recommendedAction:
          pregnancySeverity === "major"
            ? "Avoid during pregnancy unless a specialist explicitly justifies the exception."
            : pregnancySeverity === "moderate"
              ? "Use only after benefit-risk review and document the clinical rationale."
              : "No specific pregnancy restriction is listed in the local product record.",
        evidence: source,
      });

      return medicineAlerts;
    });
  }, [selectedMedicineByLine]);

  const safetyPanelAlerts = useMemo(
    () => [...alerts, ...tnMedicineSafetyAlerts],
    [alerts, tnMedicineSafetyAlerts],
  );

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
                resetPrescriptionDraft();
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
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={generate}
                  disabled={generating || !selectedPatient || !diagnosis.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
                >
                  <Sparkles className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                  {generating ? t("rx.generating") : t("rx.generate")}
                </button>
                <button
                  onClick={addManualMedication}
                  disabled={!selectedPatient}
                  className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
                >
                  <Plus className="h-4 w-4" />
                  {manualStarted || hasMedicationLines ? t("rx.addManualMedication") : t("rx.startManual")}
                </button>
              </div>
            </div>
          </div>

          {showPrescriptionEditor && selectedPatient && (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">{isManualPrescription ? t("rx.manualPrescription") : t("rx.aiProposal")}</h2>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${summaryTone}`}>
                      {summaryLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{isManualPrescription ? t("rx.manualHelp") : t("rx.editableHelp")}</p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {meds.map((med) => (
                  <PrescriptionMedicationRow
                    key={med.id}
                    med={med}
                    onChange={(patch) => updateMed(med.id, patch)}
                    onRemove={() => removeMed(med.id)}
                    medicineOptions={medicineOptionsByLine[med.id] ?? []}
                    medicineSearchLoading={medicineLoadingByLine[med.id] ?? false}
                    selectedMedicine={selectedMedicineByLine[med.id]}
                    onMedicineSearch={(query) => searchMedicinesForLine(med.id, query)}
                    onSelectMedicine={(medicine) => selectMedicineForLine(med.id, medicine)}
                  />
                ))}
                {meds.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {t("rx.noMedication")}
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-border bg-muted/30 flex flex-wrap gap-2">
                {generated && (
                  <button onClick={generate} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth">
                    <RefreshCw className="h-3.5 w-3.5" /> {t("rx.regenerate")}
                  </button>
                )}
                <button onClick={addManualMedication} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth">
                  <Plus className="h-3.5 w-3.5" /> {t("rx.addManualMedication")}
                </button>
                <button
                  onClick={() => {
                    void (async () => {
                      try {
                        const saved = await saveCurrentPrescription();
                        if (!saved) return;
                        setCaseStatus("draft");
                        toast({
                          title: t("rx.draftSavedTitle"),
                          description: isManualPrescription ? t("rx.manualDraftSavedDescription") : t("rx.draftSavedDescription"),
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
                {generated && (
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
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    disabled={hasMissingData || isRejected || !hasMedicationLines || hasMedicationWithoutName || hasManualMedicationWithoutCatalog}
                    onClick={() => {
                      void (async () => {
                        try {
                          const saved = await saveCurrentPrescription({ status: "validated" });
                          if (!saved) return;
                          const validated = await validatePrescription(saved.id);
                          setSavedPrescriptionId(validated.id);
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
                    title={
                      hasMissingData
                        ? t("rx.resolveMissingFirst")
                        : isRejected
                          ? t("rx.generateBeforeValidate")
                          : !hasMedicationLines
                            ? t("rx.addMedicationFirst")
                            : hasMedicationWithoutName
                              ? t("rx.medicineNameRequired")
                              : hasManualMedicationWithoutCatalog
                                ? t("rx.selectMedicineFromCatalog")
                              : ""
                    }
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> {t("rx.validate")}
                  </button>
                  <button
                    type="button"
                    disabled={!hasMedicationLines || hasMedicationWithoutName || hasManualMedicationWithoutCatalog}
                    onClick={() => void openOrdonnance()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft text-primary px-3 py-2 text-xs font-semibold hover:bg-primary-soft/70 transition-smooth"
                  >
                    <FileText className="h-3.5 w-3.5" /> {t("rx.generateDocument")}
                  </button>
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
          <SafetyPanel alerts={selectedPatient ? safetyPanelAlerts : []} />
        </div>
      </div>
    </div>
  );
}

export { CheckCircle2 };
