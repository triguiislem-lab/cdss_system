import { IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  ContributionKind,
  ContributionStatus,
} from '../../common/entities/enums';

export class CreateMedicineContributionDto {
  @IsEnum(ContributionKind)
  kind: ContributionKind;

  @IsOptional()
  @IsUUID()
  targetMedicineId?: string;

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsString()
  oldValue?: string;

  @IsOptional()
  @IsString()
  newValue?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsObject()
  newMedicine?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  rationale?: string;
}

export class RefuseContributionDto {
  @IsString()
  refusalReason: string;
}

export class ContributionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ContributionStatus)
  status?: ContributionStatus;

  @IsOptional()
  @IsEnum(ContributionKind)
  kind?: ContributionKind;
}
