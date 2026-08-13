import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntry } from '../audit/audit-entry.entity';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { MedicinesModule } from '../medicines/medicines.module';
import { Medicine } from '../medicines/medicine.entity';
import { Patient } from '../patients/patient.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import {
  ContactMessage,
  NewsletterSubscription,
  Post,
} from '../cms/cms.entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MedicinesModule,
    TypeOrmModule.forFeature([
      AuditEntry,
      Consultation,
      ContactMessage,
      DoctorProfile,
      Medicine,
      MedicineContribution,
      NewsletterSubscription,
      Patient,
      Post,
      Prescription,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
