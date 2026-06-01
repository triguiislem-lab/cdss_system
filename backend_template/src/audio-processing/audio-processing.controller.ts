import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateAudioUploadTargetDto,
  StartAudioProcessingDto,
} from './dto/audio-processing.dto';
import { AudioProcessingService } from './audio-processing.service';

type RawAudioRequest = Request & { body: Buffer };

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AudioProcessingController {
  constructor(private readonly audioProcessing: AudioProcessingService) {}

  @Post('audio/create-upload-url')
  @Roles(UserRole.Doctor)
  createUploadTarget(@Body() dto: CreateAudioUploadTargetDto) {
    return this.audioProcessing.createUploadTarget(dto);
  }

  @Post('audio/upload')
  @Roles(UserRole.Doctor)
  uploadAudio(
    @Req() req: RawAudioRequest,
    @Query('consultationId') consultationId?: string,
    @Query('filename') filename?: string,
  ) {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new BadRequestException('Audio request body is empty');
    }

    return this.audioProcessing.uploadAudio({
      consultationId,
      filename,
      contentType: req.headers['content-type'],
      body: req.body,
    });
  }

  @Post('audio/start-processing')
  @Roles(UserRole.Doctor)
  startProcessing(@Body() dto: StartAudioProcessingDto) {
    return this.audioProcessing.startProcessing(dto);
  }

  @Get('kaggle/status')
  @Roles(UserRole.Admin, UserRole.Doctor)
  getKaggleStatus() {
    return this.audioProcessing.getKaggleKernelStatus();
  }

  @Post('kaggle/fetch-output')
  @Roles(UserRole.Admin, UserRole.Doctor)
  fetchKaggleOutput() {
    return this.audioProcessing.fetchKaggleKernelOutput();
  }
}
