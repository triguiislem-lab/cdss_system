export type Severity = "critical" | "major" | "moderate" | "minor" | "info";
export type RiskLevel = "high" | "medium" | "low";
export type PrescriptionStatus = "draft" | "pending_review" | "validated" | "rejected" | "needs_data";

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: "M" | "F";
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: "male" | "female" | "other";
  phone1?: string;
  phone2?: string;
  phone3?: string;
  profession?: string;
  internalCode?: string;
  address?: string;
  weightKg: number;
  heightCm: number;
  allergies: string[];
  currentMedications: { name: string; dose: string }[];
  comorbidities: string[];
  renal: { gfr: number; status: "normal" | "mild" | "moderate" | "severe" };
  liver: { status: "normal" | "impaired"; note?: string };
  vitals: { hr: number; bp: string; temp: number; spo2: number };
  flags: string[];
  missingData?: string[];
}

export function calculateAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) age -= 1;
  return age >= 0 ? age : undefined;
}

export function getPatientFullName(patient: Patient): string {
  const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
  return fullName || patient.name;
}

export function getPatientInitials(patient: Patient): string {
  return getPatientFullName(patient)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getPatientAge(patient: Patient): number {
  return calculateAge(patient.birthDate) ?? patient.age;
}

export function getPatientGenderLabel(patient: Patient): string {
  if (patient.gender === "male" || patient.sex === "M") return "Homme";
  if (patient.gender === "female" || patient.sex === "F") return "Femme";
  return "Autre";
}

export function getPatientSearchText(patient: Patient): string {
  return [
    patient.id,
    patient.name,
    patient.firstName,
    patient.lastName,
    patient.phone1,
    patient.phone2,
    patient.phone3,
    patient.profession,
    patient.internalCode,
    patient.address,
    ...patient.comorbidities,
    ...patient.flags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  indication: string;
  confidence: number; // 0-100
  status: "ai_proposed" | "edited" | "validated" | "rejected";
}

export interface PrescriptionCase {
  id: string;
  patientId: string;
  diagnosis: string;
  status: PrescriptionStatus;
  risk: RiskLevel;
  lastUpdate: string;
  doctor: string;
  medications: Medication[];
  notes?: string;
}

export interface SafetyAlert {
  id: string;
  severity: Severity;
  title: string;
  drugsInvolved: string[];
  explanation: string;
  recommendedAction: string;
  alternative?: string;
  evidence: string;
  evidenceUrl?: string;
}

export interface InteractionResult {
  id: string;
  drugA: string;
  drugB: string;
  severity: Severity;
  mechanism: string;
  consequence: string;
  action: string;
  evidence: string;
}

export interface AuditEntry {
  id: string;
  prescriptionId: string;
  patient: string;
  doctor: string;
  modelVersion: string;
  recommendation: string;
  doctorModification: string;
  alertsOverridden: number;
  overrideReason?: string;
  finalStatus: PrescriptionStatus;
  timestamp: string;
}

export const patients: Patient[] = [
  {
    id: "P-1042",
    name: "Eleanor Whitfield",
    age: 78,
    sex: "F",
    weightKg: 62,
    heightCm: 161,
    allergies: ["Penicillin (rash)", "Sulfa drugs"],
    currentMedications: [
      { name: "Warfarin", dose: "5 mg daily" },
      { name: "Metformin", dose: "1000 mg BID" },
      { name: "Lisinopril", dose: "10 mg daily" },
      { name: "Atorvastatin", dose: "40 mg daily" },
    ],
    comorbidities: ["Type 2 Diabetes", "Atrial fibrillation", "Hypertension", "CKD stage 3"],
    renal: { gfr: 42, status: "moderate" },
    liver: { status: "normal" },
    vitals: { hr: 78, bp: "138/82", temp: 36.8, spo2: 96 },
    flags: ["Elderly", "Polypharmacy", "Renal impairment", "Anticoagulated"],
  },
  {
    id: "P-1043",
    name: "Marcus Tanaka",
    age: 54,
    sex: "M",
    weightKg: 88,
    heightCm: 178,
    allergies: ["NKDA"],
    currentMedications: [
      { name: "Amlodipine", dose: "5 mg daily" },
      { name: "Metoprolol", dose: "50 mg BID" },
    ],
    comorbidities: ["Hypertension", "Hyperlipidemia"],
    renal: { gfr: 88, status: "normal" },
    liver: { status: "normal" },
    vitals: { hr: 72, bp: "128/78", temp: 36.6, spo2: 98 },
    flags: [],
  },
  {
    id: "P-1044",
    name: "Aisha Okonkwo",
    age: 32,
    sex: "F",
    weightKg: 68,
    heightCm: 167,
    allergies: ["Latex"],
    currentMedications: [{ name: "Levothyroxine", dose: "75 mcg daily" }],
    comorbidities: ["Hypothyroidism"],
    renal: { gfr: 102, status: "normal" },
    liver: { status: "normal" },
    vitals: { hr: 84, bp: "118/74", temp: 37.1, spo2: 99 },
    flags: ["Pregnancy (T2)"],
    missingData: ["Recent TSH"],
  },
  {
    id: "P-1045",
    name: "Rafael Mendes",
    age: 67,
    sex: "M",
    weightKg: 74,
    heightCm: 172,
    allergies: ["Aspirin (urticaria)"],
    currentMedications: [
      { name: "Apixaban", dose: "5 mg BID" },
      { name: "Furosemide", dose: "40 mg daily" },
      { name: "Spironolactone", dose: "25 mg daily" },
    ],
    comorbidities: ["Heart failure (NYHA II)", "AFib", "CKD stage 2"],
    renal: { gfr: 68, status: "mild" },
    liver: { status: "impaired", note: "Mild cirrhosis" },
    vitals: { hr: 88, bp: "112/68", temp: 36.5, spo2: 95 },
    flags: ["Elderly", "Liver impairment", "Anticoagulated"],
  },
  {
    id: "P-1046",
    name: "Hannah Lindqvist",
    age: 41,
    sex: "F",
    weightKg: 71,
    heightCm: 169,
    allergies: ["Codeine"],
    currentMedications: [],
    comorbidities: ["Migraine"],
    renal: { gfr: 96, status: "normal" },
    liver: { status: "normal" },
    vitals: { hr: 76, bp: "122/76", temp: 36.9, spo2: 98 },
    flags: [],
    missingData: ["Weight measured >6 months ago"],
  },
];

export const prescriptions: PrescriptionCase[] = [
  {
    id: "RX-2087",
    patientId: "P-1042",
    diagnosis: "Community-acquired pneumonia",
    status: "pending_review",
    risk: "high",
    lastUpdate: "2 min ago",
    doctor: "Dr. Chen",
    medications: [
      { id: "m1", name: "Amoxicillin-clavulanate", dose: "875/125 mg", route: "PO", frequency: "BID", duration: "7 days", indication: "CAP", confidence: 62, status: "ai_proposed" },
      { id: "m2", name: "Azithromycin", dose: "500 mg", route: "PO", frequency: "Daily", duration: "5 days", indication: "Atypical coverage", confidence: 88, status: "ai_proposed" },
    ],
    notes: "Productive cough x 4 days, fever 38.6°C, RR 22.",
  },
  {
    id: "RX-2086",
    patientId: "P-1045",
    diagnosis: "Acute decompensated heart failure",
    status: "pending_review",
    risk: "high",
    lastUpdate: "12 min ago",
    doctor: "Dr. Patel",
    medications: [
      { id: "m1", name: "Furosemide", dose: "80 mg", route: "IV", frequency: "BID", duration: "3 days", indication: "Volume overload", confidence: 91, status: "ai_proposed" },
    ],
  },
  {
    id: "RX-2085",
    patientId: "P-1046",
    diagnosis: "Migraine prophylaxis",
    status: "needs_data",
    risk: "low",
    lastUpdate: "1 h ago",
    doctor: "Dr. Chen",
    medications: [],
  },
  {
    id: "RX-2084",
    patientId: "P-1043",
    diagnosis: "Hypertension follow-up",
    status: "validated",
    risk: "low",
    lastUpdate: "3 h ago",
    doctor: "Dr. Chen",
    medications: [
      { id: "m1", name: "Amlodipine", dose: "10 mg", route: "PO", frequency: "Daily", duration: "Chronic", indication: "HTN", confidence: 95, status: "validated" },
    ],
  },
  {
    id: "RX-2083",
    patientId: "P-1044",
    diagnosis: "UTI in pregnancy",
    status: "draft",
    risk: "medium",
    lastUpdate: "Yesterday",
    doctor: "Dr. Patel",
    medications: [
      { id: "m1", name: "Cefpodoxime", dose: "100 mg", route: "PO", frequency: "BID", duration: "7 days", indication: "Uncomplicated UTI", confidence: 84, status: "ai_proposed" },
    ],
  },
];

export const safetyAlerts: SafetyAlert[] = [
  {
    id: "a1",
    severity: "critical",
    title: "Major bleeding risk: Warfarin + Amoxicillin-clavulanate",
    drugsInvolved: ["Warfarin", "Amoxicillin-clavulanate"],
    explanation: "Amoxicillin-clavulanate inhibits gut flora producing vitamin K and may displace warfarin from protein binding, raising INR by 1.5–3 points within 3–5 days.",
    recommendedAction: "Choose alternative antibiotic without warfarin interaction or schedule INR within 48 h with dose adjustment plan.",
    alternative: "Doxycycline 100 mg PO BID × 7 days",
    evidence: "Lexicomp, Stockley's Drug Interactions, 2024",
  },
  {
    id: "a2",
    severity: "major",
    title: "Renal dose adjustment required",
    drugsInvolved: ["Amoxicillin-clavulanate"],
    explanation: "Patient eGFR 42 mL/min. Standard dose increases risk of accumulation and crystalluria.",
    recommendedAction: "Reduce to 500/125 mg PO BID and monitor renal function.",
    evidence: "FDA label, KDIGO 2023",
  },
  {
    id: "a3",
    severity: "moderate",
    title: "QT prolongation risk",
    drugsInvolved: ["Azithromycin"],
    explanation: "Patient on no QT-prolonging agents currently, but baseline AFib increases arrhythmia risk.",
    recommendedAction: "Obtain baseline ECG; avoid in known long QT syndrome.",
    evidence: "AHA Statement on Drug-Induced Arrhythmias",
  },
  {
    id: "a4",
    severity: "minor",
    title: "GI upset likely",
    drugsInvolved: ["Amoxicillin-clavulanate"],
    explanation: "Diarrhea reported in up to 15% of patients.",
    recommendedAction: "Counsel patient; consider probiotic.",
    evidence: "UpToDate, 2024",
  },
  {
    id: "a5",
    severity: "info",
    title: "Allergy cross-check passed",
    drugsInvolved: ["Azithromycin"],
    explanation: "No known cross-reactivity with documented penicillin allergy.",
    recommendedAction: "Proceed; monitor for hypersensitivity.",
    evidence: "AAAAI Guidelines",
  },
];

export const interactions: InteractionResult[] = [
  {
    id: "i1",
    drugA: "Warfarin",
    drugB: "Amoxicillin-clavulanate",
    severity: "critical",
    mechanism: "Reduced vitamin K synthesis by gut flora; protein binding displacement",
    consequence: "Elevated INR, major bleeding risk",
    action: "Avoid combination or monitor INR within 48 h",
    evidence: "Stockley's, Lexicomp",
  },
  {
    id: "i2",
    drugA: "Apixaban",
    drugB: "Spironolactone",
    severity: "moderate",
    mechanism: "Additive hyperkalemia risk in renal impairment",
    consequence: "Hyperkalemia, arrhythmia risk",
    action: "Monitor potassium and renal function weekly initially",
    evidence: "KDIGO, FDA",
  },
  {
    id: "i3",
    drugA: "Azithromycin",
    drugB: "Metoprolol",
    severity: "minor",
    mechanism: "Mild CYP3A4 effect; QT additive minimal",
    consequence: "Low risk in this combination",
    action: "No action required; routine monitoring",
    evidence: "UpToDate",
  },
  {
    id: "i4",
    drugA: "Lisinopril",
    drugB: "Spironolactone",
    severity: "major",
    mechanism: "Both reduce potassium excretion",
    consequence: "Hyperkalemia, especially in CKD",
    action: "Check K+ at baseline, 1 week, then monthly",
    evidence: "ACC/AHA HF Guidelines 2022",
  },
];

export const auditEntries: AuditEntry[] = [
  {
    id: "AE-9001",
    prescriptionId: "RX-2084",
    patient: "Marcus Tanaka",
    doctor: "Dr. Chen",
    modelVersion: "MedCity Connect LLM v3.2.1",
    recommendation: "Amlodipine 5 mg daily",
    doctorModification: "Increased to 10 mg daily",
    alertsOverridden: 0,
    finalStatus: "validated",
    timestamp: "2026-04-29 09:14",
  },
  {
    id: "AE-9000",
    prescriptionId: "RX-2082",
    patient: "Eleanor Whitfield",
    doctor: "Dr. Patel",
    modelVersion: "MedCity Connect LLM v3.2.1",
    recommendation: "Ciprofloxacin 500 mg BID × 7d",
    doctorModification: "Switched to Nitrofurantoin 100 mg BID × 5d",
    alertsOverridden: 1,
    overrideReason: "Patient previously tolerated nitrofurantoin without QT issues",
    finalStatus: "validated",
    timestamp: "2026-04-28 16:42",
  },
  {
    id: "AE-8999",
    prescriptionId: "RX-2081",
    patient: "Rafael Mendes",
    doctor: "Dr. Chen",
    modelVersion: "MedCity Connect LLM v3.2.0",
    recommendation: "Ibuprofen 400 mg TID PRN",
    doctorModification: "Rejected — replaced with Acetaminophen 500 mg",
    alertsOverridden: 0,
    finalStatus: "rejected",
    timestamp: "2026-04-28 11:08",
  },
  {
    id: "AE-8998",
    prescriptionId: "RX-2080",
    patient: "Aisha Okonkwo",
    doctor: "Dr. Chen",
    modelVersion: "MedCity Connect LLM v3.2.0",
    recommendation: "Cefpodoxime 100 mg BID × 7d",
    doctorModification: "Accepted as-is",
    alertsOverridden: 0,
    finalStatus: "validated",
    timestamp: "2026-04-27 14:22",
  },
  {
    id: "AE-8997",
    prescriptionId: "RX-2079",
    patient: "Hannah Lindqvist",
    doctor: "Dr. Patel",
    modelVersion: "MedCity Connect LLM v3.2.0",
    recommendation: "Propranolol 40 mg BID",
    doctorModification: "Reduced to 20 mg BID",
    alertsOverridden: 1,
    overrideReason: "Tolerated low dose previously, titrating up",
    finalStatus: "validated",
    timestamp: "2026-04-26 10:55",
  },
];

export const dashboardStats = {
  pending: 7,
  highRisk: 3,
  missingData: 4,
  recentValidations: 18,
  criticalAlertsToday: 2,
};

