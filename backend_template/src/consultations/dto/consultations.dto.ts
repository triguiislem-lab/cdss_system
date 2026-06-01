import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ConsultationStatus } from '../../common/entities/enums';

export class CreateConsultationDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateConsultationDto extends PartialType(CreateConsultationDto) {
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @IsOptional()
  @IsInt()
  recordingDurationSec?: number;

  @IsOptional()
  @IsString()
  audioBucketPath?: string;

  @IsOptional()
  @IsString()
  audioProcessingStatus?: string;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsObject()
  audioProcessingResult?: Record<string, unknown>;
}

export class CreateVitalsDto {
  @IsOptional()
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  maxWeightKg?: number;

  @IsOptional()
  @IsDateString()
  lastPeriodDate?: string;

  @IsOptional()
  @IsString()
  gad?: string;

  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;

  @IsOptional()
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

export class ConsultationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}
