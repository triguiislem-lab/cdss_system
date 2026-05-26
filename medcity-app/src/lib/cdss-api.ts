import type { Medication, Patient, SafetyAlert } from "@/lib/mock-data";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "medcity-auth-token";

export type CdssDraftResult = {
  saved: boolean;
  prescription?: unknown;
  ia?: {
    trace_id?: string;
    status?: string;
    blocked?: boolean;
    draft_plan?: {
      problem_summary?: string;
      confidence?: number;
      medications?: Array<{
        active_ingredient?: string;
        indication?: string;
        dose?: string;
        frequency?: string;
        duration?: string;
        route?: string;
        rationale?: string;
        safety_considerations?: string[];
      }>;
    };
    safety?: {
      findings?: Array<{
        severity?: "info" | "warning" | "critical";
        category?: string;
        message?: string;
        medication?: string;
        evidence_source?: string;
        recommended_action?: string;
      }>;
    };
  };
  mapped?: {
    medications?: Array<{
      medicineName: string;
      dosage: string;
      route?: string;
      frequency: string;
      duration?: string;
      indication?: string;
      confidence?: number;
    }>;
    safetyAlerts?: Array<{
      severity: SafetyAlert["severity"];
      title: string;
      drugsInvolved: string[];
      explanation: string;
      recommendedAction: string;
      evidence: string;
    }>;
  };
};

export async function requestCdssDraft(input: {
  patient: Patient;
  diagnosis: string;
  notes: string;
  language?: string;
  save?: boolean;
}) {
  const res = await fetch(`${API_BASE}/api/cdss/prescriptions/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      patientId: input.patient.id,
      diagnosis: input.diagnosis,
      notes: input.notes,
      language: input.language ?? "fr",
      save: input.save ?? false,
      patientContext: mapPatientContext(input.patient),
    }),
  });

  if (!res.ok) {
    let message = `CDSS request failed (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message || data.error || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return (await res.json()) as CdssDraftResult;
}

export function mapCdssMedications(result: CdssDraftResult): Medication[] {
  const mapped = result.mapped?.medications;
  if (mapped?.length) {
    return mapped.map((med, index) => ({
      id: `ai-${index + 1}`,
      name: med.medicineName,
      dose: med.dosage,
      route: med.route ?? "oral",
      frequency: med.frequency,
      duration: med.duration ?? "",
      indication: med.indication ?? "",
      confidence: med.confidence ?? 0,
      status: "ai_proposed",
    }));
  }

  return (result.ia?.draft_plan?.medications ?? []).map((med, index) => ({
    id: `ai-${index + 1}`,
    name: med.active_ingredient || "Medication proposal",
    dose: med.dose || "To be confirmed",
    route: med.route || "oral",
    frequency: med.frequency || "To be confirmed",
    duration: med.duration || "",
    indication: med.indication || "",
    confidence:
      typeof result.ia?.draft_plan?.confidence === "number"
        ? Math.round(result.ia.draft_plan.confidence * 100)
        : 0,
    status: "ai_proposed",
  }));
}

export function mapCdssSafetyAlerts(result: CdssDraftResult): SafetyAlert[] {
  const mapped = result.mapped?.safetyAlerts;
  if (mapped?.length) {
    return mapped.map((alert, index) => ({
      id: `ia-alert-${index + 1}`,
      ...alert,
    }));
  }

  return (result.ia?.safety?.findings ?? []).map((finding, index) => ({
    id: `ia-alert-${index + 1}`,
    severity: mapSeverity(finding.severity),
    title: finding.category || "CDSS safety finding",
    drugsInvolved: finding.medication ? [finding.medication] : [],
    explanation: finding.message || "Safety issue detected by CDSS.",
    recommendedAction: finding.recommended_action || "Review before validating.",
    evidence: finding.evidence_source || "CDSS IA safety",
  }));
}

function mapPatientContext(patient: Patient) {
  return {
    sex: patient.sex === "F" ? "female" : patient.sex === "M" ? "male" : "unknown",
    ageYears: patient.age,
    weightKg: patient.weightKg,
    allergies: patient.allergies,
    currentMedications: patient.currentMedications.map((med) => `${med.name} ${med.dose}`.trim()),
    chronicConditions: patient.comorbidities,
    egfr: patient.renal.gfr,
    renalImpairment: patient.renal.status !== "normal",
    hepaticImpairment: patient.liver.status !== "normal",
    pregnant: patient.flags.some((flag) => flag.toLowerCase().includes("pregnan")),
    pregnancyStatus: patient.flags.some((flag) => flag.toLowerCase().includes("pregnan"))
      ? "pregnant"
      : undefined,
    temperatureC: patient.vitals.temp,
    heartRate: patient.vitals.hr,
    spo2: patient.vitals.spo2,
  };
}

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function mapSeverity(severity?: "info" | "warning" | "critical"): SafetyAlert["severity"] {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "moderate";
  return "info";
}
