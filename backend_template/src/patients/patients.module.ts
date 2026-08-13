import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorsModule } from '../doctors/doctors.module';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { Patient } from './patient.entity';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [
    DoctorsModule,
    TypeOrmModule.forFeature([
      Patient,
      Consultation,
      Prescription,
      ConsultationVitals,
      PharmacyDispatch,
    ]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService, TypeOrmModule],
})
export class PatientsModule {}
