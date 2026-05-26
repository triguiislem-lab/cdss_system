import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CdssPatientContextDto {
  @IsOptional()
  @IsString()
  sex?: string;

  @IsOptional()
  @IsNumber()
  ageYears?: number;

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
  @IsString()
  pregnancyStatus?: string;

  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  spo2?: number;

  @IsOptional()
  @IsInt()
  respiratoryRate?: number;
}

export class DraftCdssPrescriptionDto {
  @IsString()
  patientId: string;

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
}

export class CdssSearchQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;
}

export class CdssKgSearchQueryDto extends CdssSearchQueryDto {
  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  disease?: string;
}

export class ValidateCdssPlanDto {
  @IsString()
  patientId: string;

  @IsObject()
  plan: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CdssPatientContextDto)
  patientContext?: CdssPatientContextDto;
}
