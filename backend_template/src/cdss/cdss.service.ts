import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConsultationVitals } from "../consultations/consultation-vitals.entity";
import {
  AlertSeverity,
  MedicationStatus,
  PrescriptionStatus,
  RiskLevel,
} from "../common/entities/enums";
import { Patient } from "../patients/patient.entity";
import {
  MedicationLineDto,
  CreatePrescriptionDto,
} from "../prescriptions/dto/prescriptions.dto";
import { Prescription } from "../prescriptions/prescription.entity";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { SafetyAlert } from "../prescriptions/safety-alert.entity";
import { User } from "../users/user.entity";
import {
  CDSS_ENDPOINT_CATALOG,
  CDSS_MONITORING_SECTIONS,
  CdssMonitoringSection,
} from "./cdss-endpoints.catalog";
import {
  CdssApproveDto,
  CdssClinicianFeedbackDto,
  DraftCdssPrescriptionDto,
  LocalizeCdssPlanDto,
  CdssRejectDto,
  CdssReviseDto,
  CdssTraceFeedbackDto,
  ValidateCdssPlanDto,
} from "./dto/cdss.dto";
import { KaggleCdssWorkerService } from "./kaggle-cdss-worker.service";

type ExecutionMode = "direct" | "kaggle";

type IaMedicationDraft = {
  active_ingredient?: string;
  indication?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  route?: string;
  rationale?: string;
  safety_considerations?: string[];
};

type IaSafetyFinding = {
  severity?: "info" | "warning" | "critical";
  category?: string;
  message?: string;
  blocked?: boolean;
  medication?: string;
  rule_id?: string;
  evidence_source?: string;
  recommended_action?: string;
};

type IaTherapeuticPlan = {
  problem_summary?: string;
  medications?: IaMedicationDraft[];
  triage_recommendation?: string;
  confidence?: number;
  generation_notes?: string[];
  unresolved_questions?: string[];
};

type IaDraftResponse = {
  trace_id?: string;
  status?: string;
  blocked?: boolean;
  doctor_final_validation_required?: boolean;
  draft_plan?: IaTherapeuticPlan;
  proposal?: {
    plan?: IaTherapeuticPlan;
    clinician_review_required?: boolean;
    blocked_reasons?: string[];
    review_notes?: string[];
  };
  safety?: {
    findings?: IaSafetyFinding[];
  };
};

@Injectable()
export class CdssService {
  constructor(
    private readonly config: ConfigService,
    private readonly kaggleWorker: KaggleCdssWorkerService,
    private readonly prescriptionsService: PrescriptionsService,
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    @InjectRepository(ConsultationVitals)
    private readonly vitalsRepository: Repository<ConsultationVitals>,
    @InjectRepository(Prescription)
    private readonly prescriptionsRepository: Repository<Prescription>,
    @InjectRepository(SafetyAlert)
    private readonly alertsRepository: Repository<SafetyAlert>,
  ) {}

  getEndpointCatalog() {
    return {
      executionMode: this.getExecutionMode(),
      directFastApiBaseUrl: this.safeBaseUrlForDisplay(),
      endpoints: CDSS_ENDPOINT_CATALOG,
      kaggleNotes: {
        offlineNotebook:
          "When FastAPI runs inside an offline Kaggle notebook, NestJS submits a Kaggle job and later downloads result.json.",
        monitoring:
          "Live monitoring in Kaggle mode is limited to kaggle kernels status; detailed metrics are output files.",
      },
    };
  }

  health() {
    return this.getRoot("/health");
  }

  systemStatus() {
    return this.get("/system/status");
  }

  modelCache() {
    return this.get("/system/model-cache");
  }

  modelCacheWarmup() {
    return this.post("/system/model-cache/warmup", {});
  }

  qwenWarmup() {
    return this.post("/system/qwen/warmup", {});
  }

  readiness() {
    return this.get("/system/readiness");
  }

  async draft(dto: DraftCdssPrescriptionDto, user: User) {
    const payload = await this.buildConsultationRequest(dto);
    if (this.getExecutionMode() === "kaggle") {
      return this.kaggleWorker.submitJob(
        "draft",
        payload as Record<string, unknown>,
        this.resolveKaggleJobId(payload, dto),
      );
    }
    const ia = await this.post<IaDraftResponse>(
      "/prescriptions/draft",
      payload,
    );

    if (dto.save === false) {
      return {
        saved: false,
        ia,
        mapped: {
          medications: this.mapIaMedications(ia),
          safetyAlerts: this.mapIaSafetyAlerts(ia),
          risk: this.mapRisk(ia),
        },
      };
    }

    if (!dto.patientId) {
      throw new BadRequestException(
        "Saving a CDSS draft as a NestJS prescription requires patientId.",
      );
    }
    const plan = this.getIaPlan(ia);
    const createDto: CreatePrescriptionDto = {
      patientId: dto.patientId,
      consultationId: dto.consultationId,
      diagnosis: dto.diagnosis || plan?.problem_summary,
      notes: this.buildPrescriptionNotes(dto, ia),
      medications: this.mapIaMedications(ia),
    };
    const prescription = await this.prescriptionsService.create(
      createDto,
      user,
    );
    await this.persistIaMetadata(prescription.id, ia);
    await this.persistSafetyAlerts(prescription.id, ia);

    return {
      saved: true,
      prescription: await this.prescriptionsService.getById(prescription.id),
      ia,
    };
  }

  async analyze(dto: DraftCdssPrescriptionDto) {
    const payload = await this.buildConsultationRequest(dto);
    if (this.getExecutionMode() === "kaggle") {
      return this.kaggleWorker.submitJob(
        "analyze",
        payload as Record<string, unknown>,
        this.resolveKaggleJobId(payload, dto),
      );
    }
    return this.post("/prescriptions/analyze", payload);
  }

  async evidence(dto: DraftCdssPrescriptionDto) {
    const payload = await this.buildConsultationRequest(dto);
    if (this.getExecutionMode() === "kaggle") {
      return this.kaggleWorker.submitJob(
        "evidence",
        payload as Record<string, unknown>,
        this.resolveKaggleJobId(payload, dto),
      );
    }
    return this.post("/prescriptions/evidence", payload);
  }

  async validatePlan(dto: ValidateCdssPlanDto) {
    const payload = {
      patient:
        dto.patient ??
        (dto.patientId
          ? await this.buildPatientProfile(dto.patientId, dto.patientContext)
          : undefined),
      plan: dto.plan,
    };
    if (!payload.patient) {
      throw new BadRequestException(
        "CDSS validation requires patient or patientId.",
      );
    }
    if (this.getExecutionMode() === "kaggle") {
      return this.kaggleWorker.submitJob(
        "validate",
        payload as Record<string, unknown>,
      );
    }
    return this.post("/prescriptions/validate", payload);
  }

  async localizePlan(dto: LocalizeCdssPlanDto) {
    if (this.getExecutionMode() === "kaggle") {
      return this.kaggleWorker.submitJob(
        "localize",
        dto as unknown as Record<string, unknown>,
      );
    }
    return this.post("/prescriptions/localize", dto);
  }

  searchFormulary(query: string, limit = 10) {
    return this.get("/prescriptions/formulary/search", { query, limit });
  }

  searchKg(
    query: string,
    limit = 10,
    filters: { route?: string; disease?: string; sourceMode?: string } = {},
  ) {
    return this.get("/prescriptions/kg/search", {
      query,
      limit,
      route: filters.route,
      disease: filters.disease,
      source_mode: filters.sourceMode,
    });
  }

  searchTnMed(query: string, limit = 10) {
    return this.get("/prescriptions/tn-med/search", { query, limit });
  }

  async fetchIaAudit(traceId: string) {
    return this.get(`/prescriptions/audit/${encodeURIComponent(traceId)}`);
  }

  async fetchReviewPacket(traceId: string) {
    return this.get(
      `/prescriptions/audit/${encodeURIComponent(traceId)}/review-packet`,
    );
  }

  async getPrescriptionByTrace(traceId: string) {
    return this.get(`/prescriptions/${encodeURIComponent(traceId)}`);
  }

  async patientHistory(patientId: string) {
    return this.get(
      `/prescriptions/patient/${encodeURIComponent(patientId)}/history`,
    );
  }

  async auditTrace(traceId: string) {
    return this.get(`/audit/traces/${encodeURIComponent(traceId)}`);
  }

  async submitTraceFeedback(traceId: string, dto: CdssTraceFeedbackDto) {
    return this.post(
      `/prescriptions/${encodeURIComponent(traceId)}/feedback`,
      dto,
    );
  }

  async approve(traceId: string, dto: CdssApproveDto) {
    return this.post(
      `/prescriptions/${encodeURIComponent(traceId)}/approve`,
      dto,
    );
  }

  async reject(traceId: string, dto: CdssRejectDto) {
    return this.post(
      `/prescriptions/${encodeURIComponent(traceId)}/reject`,
      dto,
    );
  }

  async revise(traceId: string, dto: CdssReviseDto) {
    return this.post(
      `/prescriptions/${encodeURIComponent(traceId)}/revise`,
      dto,
    );
  }

  async clinicianFeedback(dto: CdssClinicianFeedbackDto) {
    return this.post("/feedback/clinician", dto);
  }

  monitoring(section: CdssMonitoringSection) {
    if (!CDSS_MONITORING_SECTIONS.includes(section)) {
      throw new BadRequestException({
        message: "Unsupported CDSS monitoring section.",
        section,
        allowed: CDSS_MONITORING_SECTIONS,
      });
    }
    if (this.getExecutionMode() === "kaggle") {
      throw new BadRequestException({
        message:
          "FastAPI monitoring endpoints are not reachable live in Kaggle offline mode. Download Kaggle output metrics instead.",
        section,
      });
    }
    return this.get(`/monitoring/${section}`);
  }

  monitoringOverview() {
    return this.monitoring("overview");
  }

  monitoringPipeline() {
    return this.monitoring("pipeline");
  }

  monitoringPerformance() {
    return this.monitoring("performance");
  }

  monitoringModel() {
    return this.monitoring("model");
  }

  monitoringSafety() {
    return this.monitoring("safety");
  }

  monitoringFeedback() {
    return this.monitoring("feedback");
  }

  monitoringFeedbackSummary() {
    return this.monitoring("feedback/summary");
  }

  monitoringRetrieval() {
    return this.monitoring("retrieval");
  }

  monitoringLocalization() {
    return this.monitoring("localization");
  }

  monitoringClinicalQuality() {
    return this.monitoring("clinical-quality");
  }

  getKaggleJobStatus(kernelRef: string) {
    return this.kaggleWorker.getStatus(kernelRef);
  }

  fetchKaggleJobResult(kernelRef: string, jobId?: string) {
    return this.kaggleWorker.fetchOutput(kernelRef, jobId);
  }

  private async buildConsultationRequest(dto: DraftCdssPrescriptionDto) {
    if (dto.fastapiPayload) {
      return dto.fastapiPayload;
    }
    if (!dto.patientId) {
      throw new BadRequestException(
        "CDSS draft/analyze/evidence requires patientId unless fastapiPayload is provided.",
      );
    }
    return {
      request_id: dto.requestId || `medcity-${Date.now()}-${dto.patientId}`,
      patient: await this.buildPatientProfile(
        dto.patientId,
        dto.patientContext,
      ),
      consultation: {
        language: dto.language || "fr",
        doctor_notes: [dto.diagnosis, dto.notes].filter(Boolean).join("\n\n"),
        transcript: dto.transcript ?? [],
      },
    };
  }

  private async buildPatientProfile(
    patientId: string,
    context: DraftCdssPrescriptionDto["patientContext"],
  ) {
    const patient = await this.patientsRepository.findOne({
      where: { id: patientId },
    });
    if (!patient && !context) {
      throw new NotFoundException("Patient not found");
    }
    if (!patient) {
      return {
        patient_id: patientId,
        age_years: context?.ageYears,
        sex: context?.sex ?? "unknown",
        weight_kg: context?.weightKg,
        age_months: context?.ageMonths,
        pregnant: context?.pregnant,
        breastfeeding: context?.breastfeeding,
        pregnancy_status: context?.pregnancyStatus,
        gestational_age_weeks: context?.gestationalAgeWeeks,
        known_allergies: context?.allergies ?? [],
        current_medications: context?.currentMedications ?? [],
        chronic_conditions: context?.chronicConditions ?? [],
        egfr: context?.egfr,
        renal_impairment: context?.renalImpairment ?? false,
        hepatic_impairment: context?.hepaticImpairment ?? false,
        temperature_c: context?.temperatureC,
        heart_rate: context?.heartRate,
        spo2: context?.spo2,
        respiratory_rate: context?.respiratoryRate,
      };
    }

    const latestVitals = await this.vitalsRepository.findOne({
      where: { patientId },
      order: { measuredAt: "DESC" },
    });
    const bp = this.parseBloodPressure(latestVitals?.bloodPressure);

    return {
      patient_id: patient.id,
      age_years: context?.ageYears ?? this.calculateAge(patient.birthDate),
      age_months: context?.ageMonths,
      sex: patient.gender,
      weight_kg: context?.weightKg ?? this.toNumber(latestVitals?.weightKg),
      pregnant: context?.pregnant,
      breastfeeding: context?.breastfeeding,
      pregnancy_status: context?.pregnancyStatus,
      gestational_age_weeks: context?.gestationalAgeWeeks,
      known_allergies: context?.allergies ?? [],
      current_medications: context?.currentMedications ?? [],
      chronic_conditions: context?.chronicConditions ?? [],
      egfr: context?.egfr,
      renal_impairment: context?.renalImpairment ?? false,
      hepatic_impairment: context?.hepaticImpairment ?? false,
      temperature_c:
        context?.temperatureC ?? this.toNumber(latestVitals?.temperature),
      heart_rate: context?.heartRate ?? latestVitals?.heartRate,
      spo2: context?.spo2 ?? this.toNumber(latestVitals?.oxygenSaturation),
      respiratory_rate:
        context?.respiratoryRate ?? latestVitals?.respiratoryRate,
      systolic_bp: bp?.systolic,
      diastolic_bp: bp?.diastolic,
    };
  }

  private mapIaMedications(ia: IaDraftResponse): MedicationLineDto[] {
    const plan = this.getIaPlan(ia);
    const confidence = plan?.confidence;
    return (plan?.medications ?? []).map((med, index) => ({
      medicineName: med.active_ingredient || "Medication proposal",
      dosage: med.dose || "To be confirmed",
      route: med.route || "oral",
      frequency: med.frequency || "To be confirmed",
      duration: med.duration,
      indication: med.indication,
      instructions: [med.rationale, ...(med.safety_considerations ?? [])]
        .filter(Boolean)
        .join("\n"),
      confidence:
        typeof confidence === "number"
          ? Math.round(confidence * 100)
          : undefined,
      status: MedicationStatus.AiProposed,
      sortOrder: index,
    }));
  }

  private mapIaSafetyAlerts(ia: IaDraftResponse) {
    return (ia.safety?.findings ?? []).map((finding) => ({
      severity: this.mapSeverity(finding.severity),
      title: finding.category || "CDSS safety finding",
      drugsInvolved: finding.medication ? [finding.medication] : [],
      explanation: finding.message || "Safety issue detected by CDSS.",
      recommendedAction:
        finding.recommended_action || "Review before validating.",
      evidence: finding.evidence_source || finding.rule_id || "CDSS IA safety",
    }));
  }

  private async persistSafetyAlerts(
    prescriptionId: string,
    ia: IaDraftResponse,
  ) {
    const alerts = this.mapIaSafetyAlerts(ia).map((alert) =>
      this.alertsRepository.create({
        ...alert,
        prescriptionId,
      }),
    );
    if (alerts.length) {
      await this.alertsRepository.save(alerts);
    }
  }

  private async persistIaMetadata(prescriptionId: string, ia: IaDraftResponse) {
    await this.prescriptionsRepository.update(prescriptionId, {
      status: PrescriptionStatus.PendingReview,
      risk: this.mapRisk(ia),
      aiTraceId: ia.trace_id,
      aiStatus: ia.status,
      aiBlocked: Boolean(ia.blocked),
      aiReviewRequired:
        ia.proposal?.clinician_review_required ??
        ia.doctor_final_validation_required ??
        true,
      aiPayload: ia,
    });
  }

  private buildPrescriptionNotes(
    dto: DraftCdssPrescriptionDto,
    ia: IaDraftResponse,
  ) {
    const plan = this.getIaPlan(ia);
    return [
      dto.notes,
      ia.trace_id ? `IA trace: ${ia.trace_id}` : undefined,
      ...(plan?.generation_notes ?? []),
      ...(ia.proposal?.review_notes ?? []),
      ...(ia.proposal?.blocked_reasons ?? []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  private mapRisk(ia: IaDraftResponse): RiskLevel {
    const findings = ia.safety?.findings ?? [];
    if (
      ia.blocked ||
      findings.some((finding) => finding.severity === "critical")
    ) {
      return RiskLevel.High;
    }
    if (findings.some((finding) => finding.severity === "warning")) {
      return RiskLevel.Medium;
    }
    return RiskLevel.Low;
  }

  private mapSeverity(severity?: IaSafetyFinding["severity"]) {
    if (severity === "critical") return AlertSeverity.Critical;
    if (severity === "warning") return AlertSeverity.Moderate;
    return AlertSeverity.Info;
  }

  private getIaPlan(ia: IaDraftResponse): IaTherapeuticPlan | undefined {
    return ia.draft_plan ?? ia.proposal?.plan;
  }

  private resolveKaggleJobId(
    payload: Record<string, unknown>,
    dto: DraftCdssPrescriptionDto,
  ): string | undefined {
    for (const value of [
      payload.request_id,
      dto.requestId,
      dto.consultationId,
    ]) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return undefined;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cdss-adapter": "nestjs",
      },
      body: JSON.stringify(payload),
    });
  }

  private async getRoot<T>(path: string): Promise<T> {
    return this.request<T>(path, undefined, true);
  }

  private async get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const qs = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) qs.set(key, String(value));
    });
    return this.request<T>(`${path}${qs.size ? `?${qs}` : ""}`);
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    root = false,
  ): Promise<T> {
    const timeoutMs = this.config.get<number>("CDSS_API_TIMEOUT_MS", 60000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = this.buildFastApiUrl(path, root);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // Keep raw text for non-JSON diagnostics.
      }
      if (!response.ok) {
        throw new BadGatewayException({
          message: "CDSS FastAPI request failed.",
          status: response.status,
          path,
          response: body,
        });
      }
      return body as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        `CDSS API is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildFastApiUrl(path: string, root = false) {
    const rawBase = this.config
      .get<string>("CDSS_API_BASE_URL", "http://127.0.0.1:8000/v1")
      .replace(/\/+$/g, "");
    const normalizedPath = path.startsWith("/v1/")
      ? path.slice("/v1".length)
      : path;
    if (root) {
      return `${rawBase.replace(/\/v1$/i, "")}${normalizedPath}`;
    }
    const versionedBase = /\/v1$/i.test(rawBase) ? rawBase : `${rawBase}/v1`;
    return `${versionedBase}${normalizedPath}`;
  }

  private getExecutionMode(): ExecutionMode {
    const mode = this.config.get<string>("CDSS_EXECUTION_MODE", "direct");
    return mode === "kaggle" ? "kaggle" : "direct";
  }

  private safeBaseUrlForDisplay(): string {
    return this.config
      .get<string>("CDSS_API_BASE_URL", "http://127.0.0.1:8000/v1")
      .replace(/:[^:@/]+@/, ":***@");
  }

  private calculateAge(birthDate: Date) {
    const today = new Date();
    const date = new Date(birthDate);
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < date.getDate())
    ) {
      age -= 1;
    }
    return Math.max(age, 0);
  }

  private parseBloodPressure(value?: string) {
    const match = value?.match(/(\d{2,3})\D+(\d{2,3})/);
    if (!match) return undefined;
    return {
      systolic: Number(match[1]),
      diastolic: Number(match[2]),
    };
  }

  private toNumber(value: unknown) {
    if (value === undefined || value === null) return undefined;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
}
