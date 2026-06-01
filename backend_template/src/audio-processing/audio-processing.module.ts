import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consultation } from '../consultations/consultation.entity';
import { AudioProcessingController } from './audio-processing.controller';
import { AudioProcessingService } from './audio-processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Consultation])],
  controllers: [AudioProcessingController],
  providers: [AudioProcessingService],
})
export class AudioProcessingModule {}
