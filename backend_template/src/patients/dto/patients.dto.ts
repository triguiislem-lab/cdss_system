import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Gender } from '../../common/entities/enums';

export class PatientMedicationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dci?: string;

  @IsOptional()
  @IsString()
  dose?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

  @IsOptional()
  @IsString()
  medicineId?: string;
}

export class CreatePatientDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsDateString()
  birthDate: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsString()
  phone1: string;

  @IsOptional()
  @IsString()
  phone2?: string;

  @IsOptional()
  @IsString()
  phone3?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  internalCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsArray()
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatientMedicationDto)
  currentMedications?: PatientMedicationDto[];

  @IsOptional()
  @IsArray()
  comorbidities?: string[];

  @IsOptional()
  @IsObject()
  renal?: { gfr?: number; status?: string };

  @IsOptional()
  @IsObject()
  liver?: { status?: string; note?: string };

  @IsOptional()
  @IsObject()
  vitalsSnapshot?: {
    hr?: number;
    bp?: string;
    temp?: number;
    spo2?: number;
  };

  @IsOptional()
  @IsArray()
  flags?: string[];

  @IsOptional()
  @IsArray()
  missingData?: string[];

  @IsOptional()
  @IsIn(['not_pregnant', 'pregnant', 'unknown'])
  pregnancyStatus?: 'not_pregnant' | 'pregnant' | 'unknown';

  @IsOptional()
  @IsIn([1, 2, 3])
  pregnancyTrimester?: 1 | 2 | 3;

  @IsOptional()
  @IsUUID()
  ownerDoctorId?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class PatientQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
