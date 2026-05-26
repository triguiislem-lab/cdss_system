import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { Patient } from '../patients/patient.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { SafetyAlert } from '../prescriptions/safety-alert.entity';
import { CdssController } from './cdss.controller';
import { CdssService } from './cdss.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      Consultation,
      ConsultationVitals,
      Prescription,
      SafetyAlert,
    ]),
    PrescriptionsModule,
  ],
  controllers: [CdssController],
  providers: [CdssService],
  exports: [CdssService],
})
export class CdssModule {}
