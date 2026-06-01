import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import {
  AlertSeverity,
  MedicationStatus,
  PrescriptionStatus,
  RiskLevel,
} from '../common/entities/enums';
import { Patient } from '../patients/patient.entity';
import {
  MedicationLineDto,
  CreatePrescriptionDto,
} from '../prescriptions/dto/prescriptions.dto';
import { Prescription } from '../prescriptions/prescription.entity';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { SafetyAlert } from '../prescriptions/safety-alert.entity';
import { User } from '../users/user.entity';
import {
  DraftCdssPrescriptionDto,
  ValidateCdssPlanDto,
} from './dto/cdss.dto';

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
  severity?: 'info' | 'warning' | 'critical';
  category?: string;
  message?: string;
  blocked?: boolean;
  medication?: string;
  rule_id?: string;
  evidence_source?: string;
  recommended_action?: string;
};

type IaDraftResponse = {
  trace_id?: string;
  status?: string;
  blocked?: boolean;
  doctor_final_validation_required?: boolean;
  draft_plan?: {
    problem_summary?: string;
    medications?: IaMedicationDraft[];
    triage_recommendation?: string;
    confidence?: number;
    generation_notes?: string[];
    unresolved_questions?: string[];
  };
  proposal?: {
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

  async draft(dto: DraftCdssPrescriptionDto, user: User) {
    const payload = await this.buildConsultationRequest(dto);
    const ia = await this.post<IaDraftResponse>('/prescriptions/draft', payload);

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

    const createDto: CreatePrescriptionDto = {
      patientId: dto.patientId,
      consultationId: dto.consultationId,
      diagnosis: dto.diagnosis || ia.draft_plan?.problem_summary,
      notes: this.buildPrescriptionNotes(dto, ia),
      medications: this.mapIaMedications(ia),
    };
    const prescription = await this.prescriptionsService.create(createDto, user);
    await this.persistIaMetadata(prescription.id, ia);
    await this.persistSafetyAlerts(prescription.id, ia);

    return {
      saved: true,
      prescription: await this.prescriptionsService.getById(prescription.id),
      ia,
    };
  }

  async analyze(dto: DraftCdssPrescriptionDto) {
    return this.post('/prescriptions/analyze', await this.buildConsultationRequest(dto));
  }

  async validatePlan(dto: ValidateCdssPlanDto) {
    const patient = await this.buildPatientProfile(dto.patientId, dto.patientContext);
    return this.post('/prescriptions/validate', {
      patient,
      plan: dto.plan,
    });
  }

  searchFormulary(query: string, limit = 10) {
    return this.get('/prescriptions/formulary/search', { query, limit });
  }

  searchKg(
    query: string,
    limit = 10,
    filters: { route?: string; disease?: string } = {},
  ) {
    return this.get('/prescriptions/kg/search', { query, limit, ...filters });
  }

  async fetchIaAudit(traceId: string) {
    return this.get(`/prescriptions/audit/${encodeURIComponent(traceId)}`);
  }

  private async buildConsultationRequest(dto: DraftCdssPrescriptionDto) {
    return {
      request_id: `medcity-${Date.now()}-${dto.patientId}`,
      patient: await this.buildPatientProfile(dto.patientId, dto.patientContext),
      consultation: {
        language: dto.language || 'fr',
        doctor_notes: [dto.diagnosis, dto.notes].filter(Boolean).join('\n\n'),
      },
    };
  }

  private async buildPatientProfile(
    patientId: string,
    context: DraftCdssPrescriptionDto['patientContext'],
  ) {
    const patient = await this.patientsRepository.findOne({
      where: { id: patientId },
    });
    if (!patient && !context) {
      throw new NotFoundException('Patient not found');
    }
    if (!patient) {
      return {
        patient_id: patientId,
        age_years: context?.ageYears,
        sex: context?.sex ?? 'unknown',
        weight_kg: context?.weightKg,
        pregnant: context?.pregnant,
        pregnancy_status: context?.pregnancyStatus,
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
      order: { measuredAt: 'DESC' },
    });
    const bp = this.parseBloodPressure(latestVitals?.bloodPressure);

    return {
      patient_id: patient.id,
      age_years: context?.ageYears ?? this.calculateAge(patient.birthDate),
      sex: patient.gender,
      weight_kg: context?.weightKg ?? this.toNumber(latestVitals?.weightKg),
      pregnant: context?.pregnant,
      pregnancy_status: context?.pregnancyStatus,
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
    const confidence = ia.draft_plan?.confidence;
    return (ia.draft_plan?.medications ?? []).map((med, index) => ({
      medicineName: med.active_ingredient || 'Medication proposal',
      dosage: med.dose || 'To be confirmed',
      route: med.route || 'oral',
      frequency: med.frequency || 'To be confirmed',
      duration: med.duration,
      indication: med.indication,
      instructions: [
        med.rationale,
        ...(med.safety_considerations ?? []),
      ]
        .filter(Boolean)
        .join('\n'),
      confidence:
        typeof confidence === 'number' ? Math.round(confidence * 100) : undefined,
      status: MedicationStatus.AiProposed,
      sortOrder: index,
    }));
  }

  private mapIaSafetyAlerts(ia: IaDraftResponse) {
    return (ia.safety?.findings ?? []).map((finding) => ({
      severity: this.mapSeverity(finding.severity),
      title: finding.category || 'CDSS safety finding',
      drugsInvolved: finding.medication ? [finding.medication] : [],
      explanation: finding.message || 'Safety issue detected by CDSS.',
      recommendedAction:
        finding.recommended_action || 'Review before validating.',
      evidence: finding.evidence_source || finding.rule_id || 'CDSS IA safety',
    }));
  }

  private async persistSafetyAlerts(prescriptionId: string, ia: IaDraftResponse) {
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
    return [
      dto.notes,
      ia.trace_id ? `IA trace: ${ia.trace_id}` : undefined,
      ...(ia.draft_plan?.generation_notes ?? []),
      ...(ia.proposal?.review_notes ?? []),
      ...(ia.proposal?.blocked_reasons ?? []),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private mapRisk(ia: IaDraftResponse): RiskLevel {
    const findings = ia.safety?.findings ?? [];
    if (ia.blocked || findings.some((finding) => finding.severity === 'critical')) {
      return RiskLevel.High;
    }
    if (findings.some((finding) => finding.severity === 'warning')) {
      return RiskLevel.Medium;
    }
    return RiskLevel.Low;
  }

  private mapSeverity(severity?: IaSafetyFinding['severity']) {
    if (severity === 'critical') return AlertSeverity.Critical;
    if (severity === 'warning') return AlertSeverity.Moderate;
    return AlertSeverity.Info;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  private async get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const qs = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) qs.set(key, String(value));
    });
    return this.request<T>(`${path}${qs.size ? `?${qs}` : ''}`);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = this.config.get<string>(
      'CDSS_API_BASE_URL',
      'http://127.0.0.1:8000/v1',
    );
    const timeoutMs = this.config.get<number>('CDSS_API_TIMEOUT_MS', 60000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new BadGatewayException(
          `CDSS API failed (${response.status}): ${body.slice(0, 500)}`,
        );
      }
      return (await response.json()) as T;
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

  private calculateAge(birthDate: Date) {
    const today = new Date();
    const date = new Date(birthDate);
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
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
