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
  @IsOptional()
  @IsString()
  sourceMedicineId?: string;

  @IsOptional()
  @IsString()
  sourceKey?: string;

  @IsOptional()
  @IsString()
  localProductName?: string;

  @IsString()
  dci: string;

  @IsArray()
  @IsString({ each: true })
  brands: string[];

  @IsString()
  atcCode: string;

  @IsString()
  drugClass: string;

  @IsOptional()
  @IsString()
  therapeuticSubclass?: string;

  @IsArray()
  @IsString({ each: true })
  forms: string[];

  @IsArray()
  @IsString({ each: true })
  laboratories: string[];

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  presentation?: string;

  @IsOptional()
  @IsString()
  amm?: string;

  @IsOptional()
  @IsString()
  ammDate?: string;

  @IsOptional()
  @IsString()
  genericStatus?: string;

  @IsOptional()
  @IsString()
  tableau?: string;

  @IsOptional()
  @IsString()
  veicStatus?: string;

  @IsOptional()
  @IsString()
  conservationDurationMonths?: string;

  @IsOptional()
  @IsString()
  primaryPackaging?: string;

  @IsOptional()
  @IsString()
  packagingSpecification?: string;

  @IsEnum(ReimbursementRate)
  reimbursement: ReimbursementRate;

  @IsOptional()
  @IsString()
  reimbursementCategory?: string;

  @IsOptional()
  @IsNumber()
  reimbursementRatePercent?: number;

  @IsOptional()
  @IsNumber()
  referenceTariffTnd?: number;

  @IsOptional()
  @IsNumber()
  publicPriceMinTnd?: number;

  @IsOptional()
  @IsNumber()
  publicPriceMaxTnd?: number;

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

  @IsOptional()
  @IsString()
  detailUrl?: string;

  @IsOptional()
  @IsString()
  rcpUrl?: string;

  @IsOptional()
  @IsString()
  noticeUrl?: string;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceSystems?: string[];
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
