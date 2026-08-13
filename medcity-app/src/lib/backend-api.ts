import type {
  AuditEntry,
  Medication,
  Patient,
  PrescriptionCase,
  RiskLevel,
  SafetyAlert,
} from "@/lib/mock-data";
import type { TunisianMedicine } from "@/lib/tunisia-medicines";
import type {
  Dispatch as PharmacyDispatch,
  DispatchChannel,
  DispatchStatus,
  DispatchTarget,
} from "@/lib/stores/pharmacy-store";
import type {
  Consultation,
  ConsultationStatus,
  ConsultationVitals,
} from "@/lib/stores/consultation-store";
import type {
  ContributionKind,
  ContributionStatus,
  MedicineContribution,
} from "@/lib/stores/medicine-contributions-store";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "medcity-auth-token";
const REFRESH_TOKEN_KEY = "medcity-refresh-token";
const AUTH_EXPIRED_EVENT = "medcity-auth-expired";

type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ApiAuthUser = {
  id: string;
  email: string;
  role: "admin" | "doctor";
  isActive?: boolean;
  doctorProfile?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    fiscalNumber?: string;
    specialty?: string;
    cnamCode?: string;
  };
};

type ApiPatient = Partial<Patient> & {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female" | "other";
  computedFlags?: string[];
  pregnancyStatus?: Patient["pregnancyStatus"];
  pregnancyTrimester?: Patient["pregnancyTrimester"];
  vitalsSnapshot?: Patient["vitals"];
  createdAt?: string;
  updatedAt?: string;
  prescriptions?: ApiPrescription[];
};

type ApiMedication = {
  id: string;
  medicineId?: string;
  dci?: string;
  medicine?: { dci?: string; localProductName?: string };
  medicineName: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration?: string;
  indication?: string;
  instructions?: string;
  confidence?: number;
  status?: Medication["status"];
  sortOrder?: number;
};

type ApiPrescription = {
  id: string;
  prescriptionNumber?: string;
  patientId: string;
  patient?: ApiPatient;
  doctor?: { id?: string; firstName?: string; lastName?: string; email?: string; specialty?: string; facility?: string };
  doctorId?: string;
  consultationId?: string;
  consultation?: ApiConsultation;
  diagnosis?: string;
  status?: PrescriptionCase["status"];
  risk?: RiskLevel;
  notes?: string;
  medications?: ApiMedication[];
  safetyAlerts?: SafetyAlert[];
  pharmacyDispatches?: ApiDispatch[];
  printSnapshot?: ApiPrintSnapshot;
  aiTraceId?: string;
  aiStatus?: string;
  aiBlocked?: boolean;
  aiReviewRequired?: boolean;
  aiPayload?: unknown;
  validatedAt?: string;
  printedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ApiPrintSnapshot = {
  id: string;
  prescriptionId: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorSpecialty?: string;
  doctorCnamCode?: string;
  doctorFiscalNumber?: string;
  doctorPhone?: string;
  patientFirstName: string;
  patientLastName: string;
  patientBirthDate?: string;
  patientGender?: string;
  footerNumber?: string;
  printedAt: string;
};

type ApiMedicine = Omit<TunisianMedicine, "pregnancy" | "drugClass"> & {
  drugClass: string;
  pregnancy: "Autorise" | "Precaution" | "Contre-indique" | TunisianMedicine["pregnancy"];
};

type MedicineListOptions = {
  search?: string;
  page?: number;
  limit?: number;
  drugClass?: string;
};

type ApiConsultation = {
  id: string;
  patientId: string;
  patient?: ApiPatient;
  doctor?: { id?: string; firstName?: string; lastName?: string; email?: string };
  doctorId?: string;
  reason?: string;
  scheduledAt: string;
  status: ConsultationStatus;
  notes?: string;
  diagnosis?: string;
  recordingUrl?: string;
  recordingDurationSec?: number;
  audioBucketPath?: string;
  audioProcessingStatus?: string;
  transcript?: string;
  audioProcessingResult?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

type ApiVitals = {
  id: string;
  consultationId: string;
  patientId: string;
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  heightCm?: number;
  weightKg?: number;
  maxWeightKg?: number;
  lastPeriodDate?: string;
  gad?: string;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  measuredAt: string;
  createdAt: string;
};

type ApiContribution = Partial<MedicineContribution> & {
  id: string;
  kind: ContributionKind;
  status: ContributionStatus;
  createdAt: string;
};

type ApiDoctor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalNumber?: string;
  specialty?: string;
  facility?: string;
  rating?: number;
  cnamCode?: string;
  gsm?: string;
  address?: string;
  city?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: "active" | "inactive";
  patientsCount?: number;
  prescriptionsCount?: number;
  credentialEmail?: {
    status: "sent" | "skipped" | "failed";
    id?: string;
    reason?: string;
  };
};

export type ApiDoctorProfile = ApiDoctor & {
  cnamCode?: string;
  gsm?: string;
  address?: string;
};

export type AdminDashboardSummary = {
  generatedAt: string;
  source: string;
  doctors: { total: number; active: number; inactive: number };
  patients: { total: number };
  medicines: { total: number | null; source: "Firebase" | "PostgreSQL"; available: boolean };
  prescriptions: {
    total: number;
    drafts: number;
    pendingReview: number;
    validated: number;
    rejected: number;
    cancelled: number;
    highRisk: number;
  };
  consultations: { total: number; scheduled: number; upcoming: number; inProgress: number; completed: number; cancelled: number };
  contributions: { pending: number; validated: number; refused: number };
  auditEntries: number;
  cms: { published: number; draft: number; archived: number };
  contactMessages: { total: number; new: number };
  newsletter: { total: number; active: number };
};

export type DoctorDashboardSummary = {
  generatedAt: string;
  source: string;
  patients: { total: number };
  prescriptions: {
    total: number;
    drafts: number;
    pendingReview: number;
    validated: number;
    rejected: number;
    cancelled: number;
    highRisk: number;
  };
  consultations: { total: number; scheduled: number; upcoming: number; inProgress: number; completed: number; cancelled: number };
};

export type AuditSummary = {
  generatedAt: string;
  source: string;
  total: number;
  drafts: number;
  pendingReview: number;
  validated: number;
  rejected: number;
  cancelled: number;
  overridden: number;
  latestAt: string | null;
};

export type NewsletterCampaignResult = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    recipient: string;
    status: "sent" | "skipped" | "failed";
    id?: string;
    reason?: string;
  }>;
};

export type ApiPublicDoctor = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  specialty?: string;
  facility?: string;
  rating?: number;
  city?: string;
  address?: string;
  status: "active" | "inactive";
};

export type ApiCmsPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  author: string;
  imageUrl?: string;
  coverColor?: string;
  status: "published" | "draft" | "archived";
  featured: boolean;
  publishedAt?: string;
  scheduledDate?: string;
  views: number;
  readTime: number;
  commentsCount: number;
  metaTitle?: string;
  metaDescription?: string;
  updatedAt: string;
};

export type ApiCmsTestimonial = {
  id: string;
  name: string;
  role: string;
  text: string;
  rating: number;
  active: boolean;
};

export type ApiCmsPartner = {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  description?: string;
  active: boolean;
};

export type ApiCmsSpecialty = {
  id: string;
  name: string;
  description: string;
  iconName?: string;
  color?: string;
  bg?: string;
  query?: string;
  active: boolean;
};

export type ApiCmsWhyFeature = {
  id: string;
  iconName: string;
  gradient: string;
  title: string;
  text: string;
  active: boolean;
};

export type ApiContactMessage = {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  source: string;
  status: "new" | "read" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type ApiNewsletterSubscription = {
  id: string;
  email: string;
  source: string;
  status: "active" | "unsubscribed";
  createdAt: string;
  updatedAt: string;
};

export type KaggleAudioResultJson = Record<string, unknown> & {
  status?: string;
  consultation_id?: string;
  final_transcript?: string;
  transcript?: string;
  asr?: Record<string, unknown>;
  medical_extraction?: Record<string, unknown>;
  safety_validation?: Record<string, unknown>;
};

export type AudioUploadResult = {
  ok: boolean;
  consultationId: string;
  bucket: string;
  path: string;
  bytes: number;
  message?: string;
};

export type AudioProcessingStartResult = {
  ok: boolean;
  status: string;
  consultationId: string;
  bucketPath: string;
  datasetStatus?: string;
  datasetId?: string;
  datasetCommand?: string;
  kernelCommand?: string;
};

export type KaggleAudioStatusResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
};

export type KaggleAudioOutputResult = KaggleAudioStatusResult & {
  outputDir?: string;
  status?: string;
  staleOutput?: boolean;
  consultationId?: string;
  resultConsultationId?: string | null;
  resultJson?: KaggleAudioResultJson | null;
  datasetPersistence?: unknown;
};

export type PatientPayload = Pick<
  Patient,
  | "firstName"
  | "lastName"
  | "birthDate"
  | "gender"
  | "phone1"
  | "phone2"
  | "phone3"
  | "profession"
  | "internalCode"
  | "address"
  | "weightKg"
  | "heightCm"
  | "allergies"
  | "currentMedications"
  | "comorbidities"
  | "renal"
  | "liver"
  | "pregnancyStatus"
  | "pregnancyTrimester"
  | "missingData"
> & {
  vitalsSnapshot?: Patient["vitals"];
};

export async function loginApi(email: string, password: string) {
  return apiRequest<{
    accessToken: string;
    refreshToken: string;
    user: ApiAuthUser;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    auth: false,
  });
}

export async function getAdminDashboardSummary() {
  return apiRequest<AdminDashboardSummary>("/api/dashboard/admin");
}

export async function getDoctorDashboardSummary() {
  return apiRequest<DoctorDashboardSummary>("/api/dashboard/doctor");
}

export async function requestPasswordResetApi(email: string) {
  return apiRequest<{ ok: boolean }>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
    auth: false,
  });
}

export async function resetPasswordApi(token: string, password: string) {
  return apiRequest<{ ok: boolean }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
    auth: false,
  });
}

export async function getCurrentUserApi() {
  return apiRequest<ApiAuthUser>("/api/auth/me");
}

export type PatientListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  gender?: "male" | "female" | "other";
};

export async function getPatientsPage(options: PatientListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.gender) params.set("gender", options.gender);
  const result = await apiRequest<Paginated<ApiPatient>>(`/api/patients?${params}`);
  return { ...result, data: result.data.map(mapPatient) };
}

export async function listPatients(searchOrOptions?: string | PatientListOptions) {
  const options = typeof searchOrOptions === "string" ? { search: searchOrOptions } : searchOrOptions;
  return (await getPatientsPage({ limit: 100, ...options })).data;
}

export async function getPatient(id: string) {
  return mapPatient(await apiRequest<ApiPatient>(`/api/patients/${id}`));
}

export async function createPatient(payload: PatientPayload) {
  return mapPatient(await apiRequest<ApiPatient>("/api/patients", {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}

export async function updatePatient(id: string, payload: Partial<PatientPayload>) {
  return mapPatient(await apiRequest<ApiPatient>(`/api/patients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }));
}

export async function deletePatient(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/patients/${id}`, { method: "DELETE" });
}

export type PrescriptionListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  patientId?: string;
  status?: string;
  reviewable?: boolean;
  risk?: RiskLevel;
};

export async function getPrescriptionsPage(options: PrescriptionListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.patientId) params.set("patientId", options.patientId);
  if (options.status) params.set("status", options.status);
  if (options.reviewable) params.set("reviewable", "true");
  if (options.risk) params.set("risk", options.risk);
  const result = await apiRequest<Paginated<ApiPrescription>>(`/api/prescriptions?${params}`);
  return { ...result, data: result.data.map(mapPrescription) };
}

export async function listPrescriptions(options: PrescriptionListOptions = {}) {
  return (await getPrescriptionsPage({ limit: 100, ...options })).data;
}

export async function getPrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}`));
}

export async function savePrescription(input: {
  patientId: string;
  consultationId?: string;
  diagnosis?: string;
  notes?: string;
  medications: Medication[];
  safetyAlerts?: SafetyAlert[];
}) {
  return mapPrescription(await apiRequest<ApiPrescription>("/api/prescriptions", {
    method: "POST",
    body: JSON.stringify({
      patientId: input.patientId,
      consultationId: input.consultationId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      safetyAlerts: input.safetyAlerts?.map(mapSafetyAlertForApi),
      medications: input.medications.map((med, index) => ({
        medicineName: med.name,
        medicineId: med.medicineId,
        dci: med.dci,
        dosage: med.dose,
        route: med.route,
        frequency: med.frequency,
        duration: med.duration,
        indication: med.indication,
        instructions: med.instructions,
        confidence: med.confidence,
        status: med.status,
        sortOrder: index,
      })),
    }),
  }));
}

export async function updatePrescription(id: string, input: {
  patientId: string;
  consultationId?: string;
  diagnosis?: string;
  notes?: string;
  medications: Medication[];
  safetyAlerts?: SafetyAlert[];
}) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      patientId: input.patientId,
      consultationId: input.consultationId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      safetyAlerts: input.safetyAlerts?.map(mapSafetyAlertForApi),
      medications: input.medications.map((med, index) => ({
        medicineName: med.name,
        medicineId: med.medicineId,
        dci: med.dci,
        dosage: med.dose,
        route: med.route,
        frequency: med.frequency,
        duration: med.duration,
        indication: med.indication,
        instructions: med.instructions,
        confidence: med.confidence,
        status: med.status,
        sortOrder: index,
      })),
    }),
  }));
}

export type PrescriptionSafetyAction = "replace" | "adjust_dose" | "monitor" | "override";

export async function recordPrescriptionSafetyAction(
  id: string,
  input: {
    action: PrescriptionSafetyAction;
    alertTitle: string;
    recommendation?: string;
    reason?: string;
  },
) {
  return apiRequest<{ ok: boolean; action: PrescriptionSafetyAction; auditId: string }>(
    `/api/prescriptions/${id}/safety-actions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

function mapSafetyAlertForApi(alert: SafetyAlert) {
  return {
    severity: alert.severity,
    title: alert.title,
    drugsInvolved: alert.drugsInvolved,
    explanation: alert.explanation,
    recommendedAction: alert.recommendedAction,
    alternative: alert.alternative,
    evidence: alert.evidence,
    evidenceUrl: alert.evidenceUrl,
  };
}

export async function validatePrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}/validate`, { method: "POST" }));
}

export async function rejectPrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}/reject`, { method: "POST" }));
}

export async function cancelPrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}/cancel`, { method: "POST" }));
}

type AuditEntryApi = {
  id: string;
  prescriptionId: string;
  prescriptionNumber?: string | null;
  prescription?: { prescriptionNumber?: string };
  patientName?: string;
  doctorName?: string;
  modelVersion?: string;
  recommendation?: string;
  doctorModification?: string;
  alertsOverridden?: number;
  overrideReason?: string;
  finalStatus?: AuditEntry["finalStatus"];
  timestamp?: string;
};

type AuditEntriesQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: AuditEntry["finalStatus"];
  from?: string;
  to?: string;
};

function mapAuditEntry(entry: AuditEntryApi): AuditEntry {
  return {
    id: entry.id,
    prescriptionId: entry.prescriptionId,
    prescriptionNumber: entry.prescriptionNumber ?? entry.prescription?.prescriptionNumber,
    patient: entry.patientName ?? "",
    doctor: entry.doctorName ?? "",
    modelVersion: entry.modelVersion ?? "CDSS",
    recommendation: entry.recommendation ?? "",
    doctorModification: entry.doctorModification ?? "",
    alertsOverridden: entry.alertsOverridden ?? 0,
    overrideReason: entry.overrideReason,
    finalStatus: entry.finalStatus ?? "draft",
    timestamp: entry.timestamp ?? "",
  };
}

export async function getAuditEntriesPage(options: AuditEntriesQuery = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.status) params.set("status", options.status);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);

  const result = await apiRequest<Paginated<AuditEntryApi>>(`/api/audit?${params}`);
  return { ...result, data: result.data.map(mapAuditEntry) };
}

export async function getAuditSummary() {
  return apiRequest<AuditSummary>("/api/audit/summary");
}

export async function listAuditEntries(options: AuditEntriesQuery = {}) {
  const result = await getAuditEntriesPage({ limit: 100, ...options });
  return result.data;
}

export async function listMedicines(options: string | MedicineListOptions = {}) {
  return (await listMedicinesPage(options)).data;
}

export async function listMedicinesPage(options: string | MedicineListOptions = {}) {
  const resolved = typeof options === "string" ? { search: options } : options;
  const params = new URLSearchParams({
    page: String(resolved.page ?? 1),
    limit: String(resolved.limit ?? 100),
  });
  if (resolved.search?.trim()) params.set("search", resolved.search.trim());
  if (resolved.drugClass?.trim()) params.set("drugClass", resolved.drugClass.trim());
  const result = await apiRequest<Paginated<ApiMedicine>>(`/api/medicines?${params}`);
  return {
    data: result.data.map(mapMedicine),
    meta: result.meta,
  };
}

export async function getMedicine(id: string) {
  return mapMedicine(await apiRequest<ApiMedicine>(`/api/medicines/${id}`));
}

export async function listMedicineClasses() {
  return apiRequest<string[]>("/api/medicines/classes");
}

export async function listPublicMedicines(search?: string, limit = 5) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search?.trim()) params.set("search", search.trim());
  const result = await apiRequest<Paginated<ApiMedicine>>(`/api/public/medicines?${params}`, { auth: false });
  return result.data.map(mapMedicine);
}

export async function getPublicMedicine(id: string) {
  return mapMedicine(await apiRequest<ApiMedicine>(`/api/public/medicines/${id}`, { auth: false }));
}

export async function getOrdonnance(id: string) {
  return apiRequest<{
    prescriptionNumber: string;
    patientId?: string;
    status: string;
    diagnosis?: string;
    notes?: string;
    printedAt?: string;
    doctor?: {
      firstName?: string;
      lastName?: string;
      specialty?: string;
      facility?: string;
      address?: string;
      city?: string;
      phone?: string;
      cnamCode?: string;
      fiscalNumber?: string;
    };
    patient?: ApiPatient;
    medications: ApiMedication[];
    footerNumber?: string;
  }>(`/api/prescriptions/${id}/ordonnance`);
}

export async function createPrintSnapshot(id: string) {
  return apiRequest<ApiPrescription>(`/api/prescriptions/${id}/print-snapshot`, { method: "POST" });
}

export async function sendPrescriptionToTarget(input: {
  prescriptionId: string;
  target: DispatchTarget;
  recipient: string;
  channel: DispatchChannel;
  note?: string;
}) {
  const path =
    input.target === "patient"
      ? `/api/prescriptions/${input.prescriptionId}/send-to-patient`
      : `/api/prescriptions/${input.prescriptionId}/send-to-pharmacy`;
  return mapDispatch(
    await apiRequest<ApiDispatch>(path, {
      method: "POST",
      body: JSON.stringify({
        recipient: input.recipient,
        channel: input.channel,
        note: input.note,
      }),
    }),
  );
}

export type DispatchListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  status?: DispatchStatus;
  target?: DispatchTarget;
};

export async function getDispatchesPage(options: DispatchListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.status) params.set("status", options.status);
  if (options.target) params.set("target", options.target);
  const result = await apiRequest<Paginated<ApiDispatch>>(`/api/pharmacy/dispatches?${params}`);
  return { ...result, data: result.data.map(mapDispatch) };
}

export async function listDispatches(options: DispatchListOptions = {}) {
  return (await getDispatchesPage({ limit: 100, ...options })).data;
}

export async function updateDispatchStatus(id: string, status: DispatchStatus) {
  return mapDispatch(await apiRequest<ApiDispatch>(`/api/pharmacy/dispatches/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }));
}

export async function updateDispatch(id: string, input: {
  target?: DispatchTarget;
  recipient?: string;
  channel?: DispatchChannel;
  status?: DispatchStatus;
  note?: string;
}) {
  return mapDispatch(await apiRequest<ApiDispatch>(`/api/pharmacy/dispatches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }));
}

export async function deleteDispatch(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/pharmacy/dispatches/${id}`, { method: "DELETE" });
}

export type ConsultationListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  patientId?: string;
  doctorId?: string;
  status?: ConsultationStatus;
};

export async function getConsultationsPage(options: ConsultationListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.patientId) params.set("patientId", options.patientId);
  if (options.doctorId) params.set("doctorId", options.doctorId);
  if (options.status) params.set("status", options.status);
  const result = await apiRequest<Paginated<ApiConsultation>>(`/api/consultations?${params}`);
  return { ...result, data: result.data.map(mapConsultation) };
}

export async function listConsultations(options: ConsultationListOptions = {}) {
  return (await getConsultationsPage({ limit: 100, ...options })).data;
}

export async function getConsultation(id: string) {
  return mapConsultation(await apiRequest<ApiConsultation>(`/api/consultations/${id}`));
}

export async function createConsultation(input: {
  patientId: string;
  doctorId?: string;
  reason?: string;
  scheduledAt: string;
  notes?: string;
}) {
  return mapConsultation(await apiRequest<ApiConsultation>("/api/consultations", {
    method: "POST",
    body: JSON.stringify(input),
  }));
}

export async function updateConsultation(id: string, input: Partial<{
  patientId: string;
  doctorId: string;
  reason: string;
  scheduledAt: string;
  notes: string;
  diagnosis: string;
  status: ConsultationStatus;
  startedAt: string;
  endedAt: string;
  recordingUrl: string;
  recordingDurationSec: number;
  audioBucketPath: string;
  audioProcessingStatus: string;
  transcript: string;
  audioProcessingResult: Record<string, unknown>;
}>) {
  return mapConsultation(await apiRequest<ApiConsultation>(`/api/consultations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }));
}

export async function deleteConsultation(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/consultations/${id}`, { method: "DELETE" });
}

export async function listConsultationVitals(id: string) {
  const data = await apiRequest<ApiVitals[]>(`/api/consultations/${id}/vitals`);
  return data.map(mapVitals);
}

export async function createConsultationVitals(id: string, input: Partial<ConsultationVitals>) {
  return mapVitals(await apiRequest<ApiVitals>(`/api/consultations/${id}/vitals`, {
    method: "POST",
    body: JSON.stringify(input),
  }));
}

export async function uploadConsultationAudio(consultationId: string, audioFile: File) {
  const params = new URLSearchParams({
    consultationId,
    filename: audioFile.name || `${consultationId}.webm`,
  });
  return apiBinaryRequest<AudioUploadResult>(`/api/audio/upload?${params}`, {
    method: "POST",
    body: audioFile,
    contentType: audioFile.type || "application/octet-stream",
  });
}

export async function startConsultationAudioProcessing(input: {
  consultationId: string;
  bucketPath: string;
}) {
  return apiRequest<AudioProcessingStartResult>("/api/audio/start-processing", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getKaggleAudioStatus() {
  return apiRequest<KaggleAudioStatusResult>("/api/kaggle/status");
}

export async function fetchKaggleAudioOutput(consultationId?: string) {
  return apiRequest<KaggleAudioOutputResult>("/api/kaggle/fetch-output", {
    method: "POST",
    body: JSON.stringify({ consultationId }),
  });
}

export type ContributionListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  status?: ContributionStatus;
  kind?: ContributionKind;
};

export async function getMedicineContributionsPage(options: ContributionListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.status) params.set("status", options.status);
  if (options.kind) params.set("kind", options.kind);
  const result = await apiRequest<Paginated<ApiContribution>>(`/api/medicine-contributions?${params}`);
  return { ...result, data: result.data.map(mapContribution) };
}

export async function listMedicineContributions(options: ContributionListOptions = {}) {
  return (await getMedicineContributionsPage({ limit: 100, ...options })).data;
}

export async function createMedicineContribution(input: {
  kind: ContributionKind;
  targetMedicineId?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
  newMedicine?: Record<string, unknown>;
  rationale?: string;
}) {
  return mapContribution(await apiRequest<ApiContribution>("/api/medicine-contributions", {
    method: "POST",
    body: JSON.stringify(input),
  }));
}

export async function validateMedicineContribution(id: string) {
  return mapContribution(await apiRequest<ApiContribution>(`/api/medicine-contributions/${id}/validate`, { method: "POST" }));
}

export async function refuseMedicineContribution(id: string, refusalReason: string) {
  return mapContribution(await apiRequest<ApiContribution>(`/api/medicine-contributions/${id}/refuse`, {
    method: "POST",
    body: JSON.stringify({ refusalReason }),
  }));
}

export async function deleteMedicineContribution(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/medicine-contributions/${id}`, { method: "DELETE" });
}

export type DoctorListOptions = {
  page?: number;
  limit?: number;
  search?: string;
};

export async function getDoctorsPage(options: DoctorListOptions = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  const result = await apiRequest<Paginated<ApiDoctor>>(`/api/doctors?${params}`);
  return { ...result, data: result.data };
}

export async function listDoctors(searchOrOptions?: string | DoctorListOptions) {
  const options = typeof searchOrOptions === "string" ? { search: searchOrOptions } : searchOrOptions;
  return (await getDoctorsPage({ limit: 100, ...options })).data;
}

export async function listPublicDoctors(search?: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (search?.trim()) params.set("search", search.trim());
  const result = await apiRequest<Paginated<ApiPublicDoctor>>(`/api/public/doctors?${params}`, { auth: false });
  return result.data;
}

export async function createDoctor(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalNumber: string;
  specialty?: string;
  facility?: string;
  rating?: number;
  address?: string;
  cnamCode?: string;
  city?: string;
  password: string;
}) {
  return apiRequest<ApiDoctor>("/api/doctors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDoctor(id: string, input: Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalNumber: string;
  specialty: string;
  facility: string;
  rating?: number;
  cnamCode: string;
  address?: string;
  city: string;
  password: string;
}>) {
  return apiRequest<ApiDoctor>(`/api/doctors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateDoctorStatus(id: string, status: "active" | "inactive") {
  return apiRequest<ApiDoctor>(`/api/doctors/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteDoctor(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/doctors/${id}`, { method: "DELETE" });
}

export async function getDoctorProfile() {
  return apiRequest<ApiDoctorProfile>("/api/doctors/me/profile");
}

export async function updateDoctorProfile(input: Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalNumber: string;
  specialty: string;
  cnamCode: string;
  gsm: string;
  address: string;
  city: string;
}>) {
  return apiRequest<ApiDoctorProfile>("/api/doctors/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listCmsPosts() {
  return apiRequest<ApiCmsPost[]>("/api/cms/posts");
}

export async function listPublicCmsPosts() {
  return apiRequest<ApiCmsPost[]>("/api/public/posts", { auth: false });
}

export async function getPublicCmsPost(slug: string) {
  return apiRequest<ApiCmsPost>(`/api/public/posts/${encodeURIComponent(slug)}`, { auth: false });
}

export async function createCmsPost(input: Partial<ApiCmsPost>) {
  return apiRequest<ApiCmsPost>("/api/cms/posts", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCmsPost(id: string, input: Partial<ApiCmsPost>) {
  return apiRequest<ApiCmsPost>(`/api/cms/posts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteCmsPost(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/cms/posts/${id}`, { method: "DELETE" });
}

export async function listCmsTestimonials() {
  return apiRequest<ApiCmsTestimonial[]>("/api/cms/testimonials");
}

export async function listPublicCmsTestimonials() {
  return apiRequest<ApiCmsTestimonial[]>("/api/public/testimonials", { auth: false });
}

export async function createCmsTestimonial(input: Omit<ApiCmsTestimonial, "id">) {
  return apiRequest<ApiCmsTestimonial>("/api/cms/testimonials", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCmsTestimonial(id: string, input: Partial<ApiCmsTestimonial>) {
  return apiRequest<ApiCmsTestimonial>(`/api/cms/testimonials/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteCmsTestimonial(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/cms/testimonials/${id}`, { method: "DELETE" });
}

export async function listCmsPartners() {
  return apiRequest<ApiCmsPartner[]>("/api/cms/partners");
}

export async function listPublicCmsPartners() {
  return apiRequest<ApiCmsPartner[]>("/api/public/partners", { auth: false });
}

export async function createCmsPartner(input: Omit<ApiCmsPartner, "id">) {
  return apiRequest<ApiCmsPartner>("/api/cms/partners", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCmsPartner(id: string, input: Partial<ApiCmsPartner>) {
  return apiRequest<ApiCmsPartner>(`/api/cms/partners/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteCmsPartner(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/cms/partners/${id}`, { method: "DELETE" });
}

export async function listCmsSpecialties() {
  return apiRequest<ApiCmsSpecialty[]>("/api/cms/specialties");
}

export async function listPublicCmsSpecialties() {
  return apiRequest<ApiCmsSpecialty[]>("/api/public/specialties", { auth: false });
}

export async function createCmsSpecialty(input: Omit<ApiCmsSpecialty, "id">) {
  return apiRequest<ApiCmsSpecialty>("/api/cms/specialties", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCmsSpecialty(id: string, input: Partial<ApiCmsSpecialty>) {
  return apiRequest<ApiCmsSpecialty>(`/api/cms/specialties/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteCmsSpecialty(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/cms/specialties/${id}`, { method: "DELETE" });
}

export async function listCmsWhyFeatures() {
  return apiRequest<ApiCmsWhyFeature[]>("/api/cms/why-features");
}

export async function getPublicCmsHome() {
  return apiRequest<{
    posts: ApiCmsPost[];
    testimonials: ApiCmsTestimonial[];
    partners: ApiCmsPartner[];
    specialties: ApiCmsSpecialty[];
    whyFeatures: ApiCmsWhyFeature[];
  }>("/api/public/home", { auth: false });
}

export async function createContactMessage(input: {
  name: string;
  email: string;
  subject?: string;
  message: string;
  source?: string;
}) {
  return apiRequest<ApiContactMessage>("/api/public/contact-messages", {
    method: "POST",
    body: JSON.stringify(input),
    auth: false,
  });
}

export async function listContactMessages() {
  return apiRequest<ApiContactMessage[]>("/api/cms/contact-messages");
}

export async function updateContactMessageStatus(
  id: string,
  status: ApiContactMessage["status"],
) {
  return apiRequest<ApiContactMessage>(`/api/cms/contact-messages/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function subscribeNewsletter(email: string, source = "footer") {
  return apiRequest<ApiNewsletterSubscription>("/api/public/newsletter-subscriptions", {
    method: "POST",
    body: JSON.stringify({ email, source }),
    auth: false,
  });
}

export async function listNewsletterSubscriptions() {
  return apiRequest<ApiNewsletterSubscription[]>("/api/cms/newsletter-subscriptions");
}

export async function sendNewsletterCampaign(input: {
  subject: string;
  message: string;
}) {
  return apiRequest<NewsletterCampaignResult>("/api/cms/newsletter-subscriptions/send-campaign", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createCmsWhyFeature(input: Omit<ApiCmsWhyFeature, "id">) {
  return apiRequest<ApiCmsWhyFeature>("/api/cms/why-features", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCmsWhyFeature(id: string, input: Partial<ApiCmsWhyFeature>) {
  return apiRequest<ApiCmsWhyFeature>(`/api/cms/why-features/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteCmsWhyFeature(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/cms/why-features/${id}`, { method: "DELETE" });
}

type ApiDispatch = {
  id: string;
  prescriptionId?: string;
  prescription?: { id: string; prescriptionNumber?: string };
  patientId?: string;
  patientName: string;
  target: DispatchTarget;
  recipient: string;
  channel: DispatchChannel;
  status: DispatchStatus;
  note?: string;
  sentAt?: string;
  updatedAt?: string;
};

export function mapPatient(patient: ApiPatient): Patient {
  const age = calculateAge(patient.birthDate);
  const computedFlags = patient.computedFlags ?? [];
  return {
    id: patient.id,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    age,
    sex: patient.gender === "male" ? "M" : patient.gender === "female" ? "F" : "O",
    firstName: patient.firstName,
    lastName: patient.lastName,
    birthDate: patient.birthDate?.slice(0, 10),
    gender: patient.gender,
    phone1: patient.phone1 ?? "",
    phone2: patient.phone2,
    phone3: patient.phone3,
    profession: patient.profession,
    internalCode: patient.internalCode,
    address: patient.address,
    weightKg: patient.weightKg == null ? undefined : Number(patient.weightKg),
    heightCm: patient.heightCm == null ? undefined : Number(patient.heightCm),
    allergies: patient.allergies ?? [],
    currentMedications: patient.currentMedications ?? [],
    comorbidities: patient.comorbidities ?? [],
    renal: patient.renal ?? { status: "unknown" },
    liver: patient.liver ?? { status: "unknown" },
    vitals: patient.vitalsSnapshot ?? {},
    flags: [...new Set([...(patient.flags ?? []), ...computedFlags])],
    computedFlags,
    pregnancyStatus: patient.pregnancyStatus,
    pregnancyTrimester: patient.pregnancyTrimester,
    missingData: patient.missingData,
  };
}

export function mapPrescription(entry: ApiPrescription): PrescriptionCase {
  return {
    id: entry.id,
    prescriptionNumber: entry.prescriptionNumber,
    patientId: entry.patientId,
    patient: entry.patient ? mapPatient(entry.patient) : undefined,
    diagnosis: entry.diagnosis ?? "",
    status: entry.status ?? "draft",
    risk: entry.risk ?? null,
    riskAssessed: entry.risk !== undefined && entry.risk !== null,
    lastUpdate: formatRelative(entry.updatedAt ?? entry.createdAt),
    doctor: formatDoctor(entry.doctor),
    doctorId: entry.doctorId,
    consultationId: entry.consultationId,
    aiTraceId: entry.aiTraceId,
    aiStatus: entry.aiStatus,
    aiBlocked: entry.aiBlocked,
    aiReviewRequired: entry.aiReviewRequired,
    aiPayload: entry.aiPayload,
    validatedAt: entry.validatedAt,
    printedAt: entry.printedAt,
    notes: entry.notes,
    safetyAlerts: entry.safetyAlerts ?? [],
    medications: (entry.medications ?? []).map((med) => ({
      id: med.id,
      medicineId: med.medicineId,
      dci: med.dci ?? med.medicine?.dci,
      name: med.medicineName,
      dose: med.dosage,
      route: med.route ?? "",
      frequency: med.frequency,
      duration: med.duration ?? "",
      indication: med.indication ?? "",
      instructions: med.instructions ?? "",
      confidence: med.confidence ?? 0,
      status: med.status ?? "ai_proposed",
    })),
  };
}

function mapMedicine(medicine: ApiMedicine): TunisianMedicine {
  return {
    ...medicine,
    drugClass: medicine.drugClass as TunisianMedicine["drugClass"],
    pregnancy: mapPregnancy(medicine.pregnancy),
    priceTndApprox: Number(medicine.priceTndApprox ?? 0),
    reimbursementRatePercent: optionalNumber(medicine.reimbursementRatePercent),
    referenceTariffTnd: optionalNumber(medicine.referenceTariffTnd),
    publicPriceMinTnd: optionalNumber(medicine.publicPriceMinTnd),
    publicPriceMaxTnd: optionalNumber(medicine.publicPriceMaxTnd),
    indication: normalizeMedicineText(medicine.indication),
    posologyAdult: normalizeMedicineText(medicine.posologyAdult),
  };
}

function normalizeMedicineText(value?: string) {
  const normalized = value?.trim();
  if (!normalized) return "Non renseigne";
  const lower = normalized.toLocaleLowerCase();
  if (lower.includes("indication non expos") || lower.startsWith("non renseign")) return "Non renseigne";
  return normalized;
}

function mapDispatch(dispatch: ApiDispatch): PharmacyDispatch {
  return {
    id: dispatch.id,
    rxId: dispatch.prescriptionId ?? dispatch.prescription?.id ?? "",
    patientId: dispatch.patientId ?? "",
    patientName: dispatch.patientName,
    target: dispatch.target,
    recipient: dispatch.recipient,
    channel: dispatch.channel,
    status: dispatch.status,
    note: dispatch.note,
    sentAt: dispatch.sentAt ?? new Date().toISOString(),
    updatedAt: dispatch.updatedAt ?? dispatch.sentAt ?? new Date().toISOString(),
  };
}

function mapConsultation(consultation: ApiConsultation): Consultation {
  return {
    id: consultation.id,
    patientId: consultation.patientId,
    patientName: consultation.patient
      ? `${consultation.patient.firstName} ${consultation.patient.lastName}`.trim()
      : consultation.patientId,
    doctor: formatDoctor(consultation.doctor),
    reason: consultation.reason ?? "",
    scheduledAt: consultation.scheduledAt,
    status: consultation.status,
    notes: consultation.notes ?? "",
    diagnosis: consultation.diagnosis,
    recordingUrl: consultation.recordingUrl,
    recordingDurationSec: consultation.recordingDurationSec,
    audioBucketPath: consultation.audioBucketPath,
    audioProcessingStatus: consultation.audioProcessingStatus,
    transcript: consultation.transcript,
    audioProcessingResult: consultation.audioProcessingResult,
    startedAt: consultation.startedAt,
    endedAt: consultation.endedAt,
    createdAt: consultation.createdAt,
    updatedAt: consultation.updatedAt,
  };
}

function mapVitals(vitals: ApiVitals): ConsultationVitals {
  return {
    ...vitals,
    lastPeriodDate: vitals.lastPeriodDate?.slice(0, 10),
  };
}

function mapContribution(contribution: ApiContribution): MedicineContribution {
  return {
    id: contribution.id,
    kind: contribution.kind,
    status: contribution.status,
    authorEmail: contribution.authorEmail ?? "",
    authorName: contribution.authorName ?? "",
    createdAt: contribution.createdAt,
    targetMedicineId: contribution.targetMedicineId,
    targetMedicineDci: contribution.targetMedicineDci,
    field: contribution.field,
    oldValue: contribution.oldValue,
    newValue: contribution.newValue,
    note: contribution.note,
    newMedicine: contribution.newMedicine,
    rationale: contribution.rationale,
    reviewerEmail: contribution.reviewerEmail,
    reviewerName: contribution.reviewerName,
    reviewedAt: contribution.reviewedAt,
    refusalReason: contribution.refusalReason,
  };
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.auth !== false) {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if ((response.status === 401 || response.status === 403) && options.auth !== false) {
    notifyAuthExpired();
  }
  if (!response.ok) {
    let message = `API request failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      message = data.message || data.error || message;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

async function apiBinaryRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean; contentType?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.contentType) headers["Content-Type"] = options.contentType;
  if (options.auth !== false) {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if ((response.status === 401 || response.status === 403) && options.auth !== false) {
    notifyAuthExpired();
  }
  if (!response.ok) {
    let message = `API request failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      message = data.message || data.error || message;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function notifyAuthExpired() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

function calculateAge(birthDate?: string): number {
  if (!birthDate) return 0;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) age -= 1;
  return Math.max(age, 0);
}

function formatDoctor(doctor?: ApiPrescription["doctor"]) {
  const name = [doctor?.firstName, doctor?.lastName].filter(Boolean).join(" ").trim();
  return name ? `Dr. ${name}` : doctor?.email ?? "MedCity";
}

function formatRelative(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapPregnancy(value: ApiMedicine["pregnancy"]): TunisianMedicine["pregnancy"] {
  if (value === "Autorise") return "Autorisé";
  if (value === "Precaution") return "Précaution";
  if (value === "Contre-indique") return "Contre-indiqué";
  return value as TunisianMedicine["pregnancy"];
}
