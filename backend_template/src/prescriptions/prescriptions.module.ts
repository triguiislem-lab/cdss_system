import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntry } from '../audit/audit-entry.entity';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorsModule } from '../doctors/doctors.module';
import { Patient } from '../patients/patient.entity';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { PrescriptionMedication } from './prescription-medication.entity';
import { PrescriptionPrintSnapshot } from './prescription-print-snapshot.entity';
import { Prescription } from './prescription.entity';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { SafetyAlert } from './safety-alert.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Prescription,
      PrescriptionMedication,
      PrescriptionPrintSnapshot,
      SafetyAlert,
      Patient,
      Consultation,
      AuditEntry,
      PharmacyDispatch,
    ]),
    DoctorsModule,
    PharmacyModule,
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService, TypeOrmModule],
})
export class PrescriptionsModule {}
