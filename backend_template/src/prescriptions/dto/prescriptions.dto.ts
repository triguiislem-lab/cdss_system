import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  DispatchChannel,
  AlertSeverity,
  MedicationStatus,
  PrescriptionStatus,
  RiskLevel,
} from '../../common/entities/enums';

export class PrescriptionSafetyAlertDto {
  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsString()
  title: string;

  @IsArray()
  @IsString({ each: true })
  drugsInvolved: string[];

  @IsString()
  explanation: string;

  @IsString()
  recommendedAction: string;

  @IsOptional()
  @IsString()
  alternative?: string;

  @IsString()
  evidence: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

export type PrescriptionSafetyAction =
  | 'replace'
  | 'adjust_dose'
  | 'monitor'
  | 'override';

export class RecordPrescriptionSafetyActionDto {
  @IsIn(['replace', 'adjust_dose', 'monitor', 'override'])
  action: PrescriptionSafetyAction;

  @IsString()
  alertTitle: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MedicationLineDto {
  @IsOptional()
  @IsString()
  medicineId?: string;

  @IsOptional()
  @IsString()
  dci?: string;

  @IsString()
  medicineName: string;

  @IsString()
  dosage: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsString()
  frequency: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  indication?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsEnum(MedicationStatus)
  status?: MedicationStatus;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreatePrescriptionDto {
  @IsUUID()
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationLineDto)
  medications: MedicationLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionSafetyAlertDto)
  safetyAlerts?: PrescriptionSafetyAlertDto[];
}

export class UpdatePrescriptionDto extends PartialType(CreatePrescriptionDto) {
  @IsOptional()
  @IsEnum(RiskLevel)
  risk?: RiskLevel;
}

export class SendPrescriptionDto {
  @IsString()
  recipient: string;

  @IsEnum(DispatchChannel)
  channel: DispatchChannel;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PrescriptionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsEnum(RiskLevel)
  risk?: RiskLevel;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reviewable?: boolean;
}
