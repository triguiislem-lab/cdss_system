import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import {
  CreateAudioUploadTargetDto,
  FetchKaggleOutputDto,
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
  createUploadTarget(
    @Body() dto: CreateAudioUploadTargetDto,
    @CurrentUser() user: User,
  ) {
    return this.audioProcessing.createUploadTarget(dto, user);
  }

  @Post('audio/upload')
  @Roles(UserRole.Doctor)
  uploadAudio(
    @Req() req: RawAudioRequest,
    @Query('consultationId') consultationId?: string,
    @Query('filename') filename?: string,
    @CurrentUser() user?: User,
  ) {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new BadRequestException('Audio request body is empty');
    }

    return this.audioProcessing.uploadAudio({
      consultationId,
      filename,
      contentType: req.headers['content-type'],
      body: req.body,
    }, user);
  }

  @Post('audio/start-processing')
  @Roles(UserRole.Doctor)
  startProcessing(@Body() dto: StartAudioProcessingDto, @CurrentUser() user: User) {
    return this.audioProcessing.startProcessing(dto, user);
  }

  @Get('kaggle/status')
  @Roles(UserRole.Admin, UserRole.Doctor)
  getKaggleStatus() {
    return this.audioProcessing.getKaggleKernelStatus();
  }

  @Post('kaggle/fetch-output')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Admin, UserRole.Doctor)
  fetchKaggleOutput(@Body() dto: FetchKaggleOutputDto, @CurrentUser() user: User) {
    return this.audioProcessing.fetchKaggleKernelOutput(dto, user);
  }
}
