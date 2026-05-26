import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  DispatchChannel,
  MedicationStatus,
  PrescriptionStatus,
  RiskLevel,
} from '../../common/entities/enums';

export class MedicationLineDto {
  @IsOptional()
  @IsUUID()
  medicineId?: string;

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
}

export class UpdatePrescriptionDto extends PartialType(CreatePrescriptionDto) {
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

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
}
