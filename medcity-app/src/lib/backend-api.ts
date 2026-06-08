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

type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ApiPatient = Partial<Patient> & {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female" | "other";
  vitalsSnapshot?: Patient["vitals"];
  createdAt?: string;
  updatedAt?: string;
  prescriptions?: ApiPrescription[];
};

type ApiMedication = {
  id: string;
  medicineId?: string;
  medicineName: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration?: string;
  indication?: string;
  confidence?: number;
  status?: Medication["status"];
};

type ApiPrescription = {
  id: string;
  prescriptionNumber?: string;
  patientId: string;
  patient?: ApiPatient;
  doctor?: { firstName?: string; lastName?: string; email?: string };
  diagnosis?: string;
  status?: PrescriptionCase["status"];
  risk?: RiskLevel;
  notes?: string;
  medications?: ApiMedication[];
  safetyAlerts?: SafetyAlert[];
  createdAt?: string;
  updatedAt?: string;
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
  cnamCode?: string;
  city?: string;
  status?: "active" | "inactive";
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
  | "flags"
  | "missingData"
> & {
  vitalsSnapshot?: Patient["vitals"];
};

export async function loginApi(email: string, password: string) {
  return apiRequest<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: "admin" | "doctor" };
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    auth: false,
  });
}

export async function getCurrentUserApi() {
  return apiRequest<{ id: string; email: string; role: "admin" | "doctor" }>("/api/auth/me");
}

export async function listPatients(search?: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (search?.trim()) params.set("search", search.trim());
  const result = await apiRequest<Paginated<ApiPatient>>(`/api/patients?${params}`);
  return result.data.map(mapPatient);
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

export async function listPrescriptions(options: { patientId?: string; status?: string } = {}) {
  const params = new URLSearchParams({ limit: "100" });
  if (options.patientId) params.set("patientId", options.patientId);
  if (options.status) params.set("status", options.status);
  const result = await apiRequest<Paginated<ApiPrescription>>(`/api/prescriptions?${params}`);
  return result.data.map(mapPrescription);
}

export async function getPrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}`));
}

export async function savePrescription(input: {
  patientId: string;
  diagnosis?: string;
  notes?: string;
  medications: Medication[];
}) {
  return mapPrescription(await apiRequest<ApiPrescription>("/api/prescriptions", {
    method: "POST",
    body: JSON.stringify({
      patientId: input.patientId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      medications: input.medications.map((med, index) => ({
        medicineName: med.name,
        medicineId: med.medicineId,
        dosage: med.dose,
        route: med.route,
        frequency: med.frequency,
        duration: med.duration,
        indication: med.indication,
        confidence: med.confidence,
        status: med.status,
        sortOrder: index,
      })),
    }),
  }));
}

export async function updatePrescription(id: string, input: {
  patientId: string;
  diagnosis?: string;
  notes?: string;
  medications: Medication[];
}) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      patientId: input.patientId,
      diagnosis: input.diagnosis,
      notes: input.notes,
      medications: input.medications.map((med, index) => ({
        medicineName: med.name,
        medicineId: med.medicineId,
        dosage: med.dose,
        route: med.route,
        frequency: med.frequency,
        duration: med.duration,
        indication: med.indication,
        confidence: med.confidence,
        status: med.status,
        sortOrder: index,
      })),
    }),
  }));
}

export async function validatePrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}/validate`, { method: "POST" }));
}

export async function rejectPrescription(id: string) {
  return mapPrescription(await apiRequest<ApiPrescription>(`/api/prescriptions/${id}/reject`, { method: "POST" }));
}

export async function listAuditEntries() {
  const result = await apiRequest<Paginated<{
    id: string;
    prescriptionId: string;
    patientName?: string;
    doctorName?: string;
    modelVersion?: string;
    recommendation?: string;
    doctorModification?: string;
    alertsOverridden?: number;
    overrideReason?: string;
    finalStatus?: AuditEntry["finalStatus"];
    timestamp?: string;
  }>>("/api/audit?limit=100");
  return result.data.map((entry) => ({
    id: entry.id,
    prescriptionId: entry.prescriptionId,
    patient: entry.patientName ?? "",
    doctor: entry.doctorName ?? "",
    modelVersion: entry.modelVersion ?? "CDSS",
    recommendation: entry.recommendation ?? "",
    doctorModification: entry.doctorModification ?? "",
    alertsOverridden: entry.alertsOverridden ?? 0,
    overrideReason: entry.overrideReason,
    finalStatus: entry.finalStatus ?? "draft",
    timestamp: entry.timestamp ?? "",
  }));
}

export async function listMedicines(options: string | MedicineListOptions = {}) {
  const resolved = typeof options === "string" ? { search: options } : options;
  const params = new URLSearchParams({
    page: String(resolved.page ?? 1),
    limit: String(resolved.limit ?? 100),
  });
  if (resolved.search?.trim()) params.set("search", resolved.search.trim());
  if (resolved.drugClass?.trim()) params.set("drugClass", resolved.drugClass.trim());
  const result = await apiRequest<Paginated<ApiMedicine>>(`/api/medicines?${params}`);
  return result.data.map(mapMedicine);
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

export async function getOrdonnance(id: string) {
  return apiRequest<{
    prescriptionNumber: string;
    patientId?: string;
    status: string;
    diagnosis?: string;
    notes?: string;
    printedAt?: string;
    doctor?: { firstName?: string; lastName?: string; specialty?: string; phone?: string };
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

export async function listDispatches() {
  const result = await apiRequest<Paginated<ApiDispatch>>("/api/pharmacy/dispatches?limit=100");
  return result.data.map(mapDispatch);
}

export async function updateDispatchStatus(id: string, status: DispatchStatus) {
  return mapDispatch(await apiRequest<ApiDispatch>(`/api/pharmacy/dispatches/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }));
}

export async function updateDispatch(id: string, input: {
  prescriptionId?: string;
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

export async function listConsultations(options: { patientId?: string; status?: ConsultationStatus } = {}) {
  const params = new URLSearchParams({ limit: "100" });
  if (options.patientId) params.set("patientId", options.patientId);
  if (options.status) params.set("status", options.status);
  const result = await apiRequest<Paginated<ApiConsultation>>(`/api/consultations?${params}`);
  return result.data.map(mapConsultation);
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

export async function fetchKaggleAudioOutput() {
  return apiRequest<KaggleAudioOutputResult>("/api/kaggle/fetch-output", {
    method: "POST",
  });
}

export async function listMedicineContributions(options: { status?: ContributionStatus; kind?: ContributionKind } = {}) {
  const params = new URLSearchParams({ limit: "100" });
  if (options.status) params.set("status", options.status);
  if (options.kind) params.set("kind", options.kind);
  const result = await apiRequest<Paginated<ApiContribution>>(`/api/medicine-contributions?${params}`);
  return result.data.map(mapContribution);
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

export async function listDoctors(search?: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (search?.trim()) params.set("search", search.trim());
  const result = await apiRequest<Paginated<ApiDoctor>>(`/api/doctors?${params}`);
  return result.data;
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
  cnamCode: string;
  city: string;
  password: string;
}>) {
  return apiRequest<ApiDoctor>(`/api/doctors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
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
};

export function mapPatient(patient: ApiPatient): Patient {
  const age = calculateAge(patient.birthDate);
  return {
    id: patient.id,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    age,
    sex: patient.gender === "male" ? "M" : "F",
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
    weightKg: Number(patient.weightKg ?? 0),
    heightCm: Number(patient.heightCm ?? 0),
    allergies: patient.allergies ?? [],
    currentMedications: patient.currentMedications ?? [],
    comorbidities: patient.comorbidities ?? [],
    renal: patient.renal ?? { gfr: 90, status: "normal" },
    liver: patient.liver ?? { status: "normal" },
    vitals: patient.vitalsSnapshot ?? { hr: 0, bp: "", temp: 0, spo2: 0 },
    flags: patient.flags ?? [],
    missingData: patient.missingData,
  };
}

export function mapPrescription(entry: ApiPrescription): PrescriptionCase {
  return {
    id: entry.id,
    patientId: entry.patientId,
    diagnosis: entry.diagnosis ?? "",
    status: entry.status ?? "draft",
    risk: entry.risk ?? inferRisk(entry.safetyAlerts),
    lastUpdate: formatRelative(entry.updatedAt ?? entry.createdAt),
    doctor: formatDoctor(entry.doctor),
    notes: entry.notes,
    medications: (entry.medications ?? []).map((med) => ({
      id: med.id,
      medicineId: med.medicineId,
      name: med.medicineName,
      dose: med.dosage,
      route: med.route ?? "",
      frequency: med.frequency,
      duration: med.duration ?? "",
      indication: med.indication ?? "",
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
  };
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
    updatedAt: dispatch.sentAt ?? new Date().toISOString(),
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

function inferRisk(alerts?: SafetyAlert[]): RiskLevel {
  if (alerts?.some((alert) => alert.severity === "critical" || alert.severity === "major")) return "high";
  if (alerts?.some((alert) => alert.severity === "moderate")) return "medium";
  return "low";
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
