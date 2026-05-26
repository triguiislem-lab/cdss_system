import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  DispatchChannel,
  DispatchStatus,
  PharmacyTarget,
} from '../../common/entities/enums';

export class CreatePharmacyDispatchDto {
  @IsUUID()
  prescriptionId: string;

  @IsEnum(PharmacyTarget)
  target: PharmacyTarget;

  @IsString()
  recipient: string;

  @IsEnum(DispatchChannel)
  channel: DispatchChannel;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePharmacyDispatchDto extends PartialType(
  CreatePharmacyDispatchDto,
) {
  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;
}

export class UpdateDispatchStatusDto {
  @IsEnum(DispatchStatus)
  status: DispatchStatus;
}

export class PharmacyDispatchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;

  @IsOptional()
  @IsEnum(PharmacyTarget)
  target?: PharmacyTarget;
}
