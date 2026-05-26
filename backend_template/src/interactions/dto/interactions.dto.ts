import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CheckInteractionsDto {
  @IsArray()
  @IsString({ each: true })
  drugs: string[];

  @IsOptional()
  @IsUUID()
  patientId?: string;
}

export class InteractionQueryDto extends PaginationQueryDto {}
