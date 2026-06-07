import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Gender } from '../../common/entities/enums';

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
  currentMedications?: Array<{ name: string; dose?: string }>;

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
  @IsUUID()
  ownerDoctorId?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class PatientQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
