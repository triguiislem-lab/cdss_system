import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorsModule } from '../doctors/doctors.module';
import { Patient } from '../patients/patient.entity';
import { ConsultationVitals } from './consultation-vitals.entity';
import { Consultation } from './consultation.entity';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Consultation, ConsultationVitals, Patient]),
    DoctorsModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService, TypeOrmModule],
})
export class ConsultationsModule {}
