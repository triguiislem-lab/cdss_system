import { IsOptional, IsString } from 'class-validator';

export class CreateAudioUploadTargetDto {
  @IsOptional()
  @IsString()
  consultationId?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

export class StartAudioProcessingDto {
  @IsString()
  consultationId: string;

  @IsString()
  bucketPath: string;
}
