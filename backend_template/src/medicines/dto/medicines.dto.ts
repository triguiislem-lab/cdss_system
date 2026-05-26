import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  PregnancyStatus,
  ReimbursementRate,
} from '../../common/entities/enums';

export class CreateMedicineDto {
  @IsString()
  dci: string;

  @IsArray()
  @IsString({ each: true })
  brands: string[];

  @IsString()
  atcCode: string;

  @IsString()
  drugClass: string;

  @IsArray()
  @IsString({ each: true })
  forms: string[];

  @IsArray()
  @IsString({ each: true })
  laboratories: string[];

  @IsEnum(ReimbursementRate)
  reimbursement: ReimbursementRate;

  @IsString()
  indication: string;

  @IsArray()
  @IsString({ each: true })
  contraindications: string[];

  @IsString()
  posologyAdult: string;

  @IsEnum(PregnancyStatus)
  pregnancy: PregnancyStatus;

  @IsOptional()
  @IsBoolean()
  renalAdjust?: boolean;

  @IsOptional()
  @IsBoolean()
  hepaticAdjust?: boolean;

  @IsOptional()
  @IsNumber()
  priceTndApprox?: number;
}

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {}

export class MedicineQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  drugClass?: string;

  @IsOptional()
  @IsEnum(PregnancyStatus)
  pregnancy?: PregnancyStatus;

  @IsOptional()
  renalAdjust?: string;

  @IsOptional()
  hepaticAdjust?: string;
}
