import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CdssPatientContextDto {
  @IsOptional()
  @IsString()
  sex?: string;

  @IsOptional()
  @IsNumber()
  ageYears?: number;

  @IsOptional()
  @IsInt()
  ageMonths?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chronicConditions?: string[];

  @IsOptional()
  @IsNumber()
  egfr?: number;

  @IsOptional()
  @IsBoolean()
  renalImpairment?: boolean;

  @IsOptional()
  @IsBoolean()
  hepaticImpairment?: boolean;

  @IsOptional()
  @IsBoolean()
  pregnant?: boolean;

  @IsOptional()
  @IsBoolean()
  breastfeeding?: boolean;

  @IsOptional()
  @IsString()
  pregnancyStatus?: string;

  @IsOptional()
  @IsNumber()
  gestationalAgeWeeks?: number;

  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  systolicBp?: number;

  @IsOptional()
  @IsInt()
  diastolicBp?: number;

  @IsOptional()
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  spo2?: number;

  @IsOptional()
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  painScore?: number;

  @IsOptional()
  @IsObject()
  vitals?: Record<string, unknown>;
}

export class CdssTranscriptTurnDto {
  @IsOptional()
  @IsString()
  speaker?: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsNumber()
  startSec?: number;

  @IsOptional()
  @IsNumber()
  endSec?: number;
}

export class DraftCdssPrescriptionDto {
  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  save?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CdssPatientContextDto)
  patientContext?: CdssPatientContextDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CdssTranscriptTurnDto)
  transcript?: CdssTranscriptTurnDto[];

  @IsOptional()
  @IsObject()
  fastapiPayload?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  saveMappedPrescription?: boolean;
}

export class CdssSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CdssTnMedSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(25)
  limit?: number;
}

export class CdssKgSearchQueryDto extends CdssSearchQueryDto {
  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  disease?: string;

  @IsOptional()
  @IsString()
  sourceMode?: string;
}

export class ValidateCdssPlanDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsObject()
  patient?: Record<string, unknown>;

  @IsObject()
  plan: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CdssPatientContextDto)
  patientContext?: CdssPatientContextDto;
}

export class LocalizeCdssPlanDto {
  @IsObject()
  plan: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class CdssTraceFeedbackFieldEditDto {
  @IsString()
  field: string;

  @IsOptional()
  old_value?: unknown;

  @IsOptional()
  new_value?: unknown;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  reason_code?: string;
}

export class CdssTraceFeedbackDto {
  @IsString()
  clinician_id: string;

  @IsString()
  @IsIn([
    "approved_as_is",
    "approved_with_edits",
    "rejected",
    "revise_requested",
    "more_info_requested",
  ])
  decision:
    | "approved_as_is"
    | "approved_with_edits"
    | "rejected"
    | "revise_requested"
    | "more_info_requested";

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reason_codes?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CdssTraceFeedbackFieldEditDto)
  field_edits?: CdssTraceFeedbackFieldEditDto[];

  @IsOptional()
  @IsString()
  clinician_notes?: string;

  @IsOptional()
  @IsBoolean()
  safety_override?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  evidence_rating?: number;
}

export class CdssApproveDto {
  @IsString()
  clinician_id: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reason_codes?: string[];
}

export class CdssRejectDto extends CdssApproveDto {
  @IsString()
  reason: string;
}

export class CdssReviseDto extends CdssApproveDto {
  @IsOptional()
  @IsObject()
  requested_changes?: Record<string, unknown>;
}

export class CdssClinicianFeedbackDto {
  @IsString()
  trace_id: string;

  @IsString()
  doctor_id: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsObject()
  original_draft?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  corrected_draft?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reason_codes?: string[];
}
