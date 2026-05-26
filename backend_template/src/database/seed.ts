import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { UserRole } from '../common/entities/enums';
import { User } from '../users/user.entity';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { Patient } from '../patients/patient.entity';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { PrescriptionMedication } from '../prescriptions/prescription-medication.entity';
import { PrescriptionPrintSnapshot } from '../prescriptions/prescription-print-snapshot.entity';
import { SafetyAlert } from '../prescriptions/safety-alert.entity';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Medicine } from '../medicines/medicine.entity';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { InteractionResult } from '../interactions/interaction-result.entity';
import { AuditEntry } from '../audit/audit-entry.entity';
import {
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from '../cms/cms.entities';

loadEnv();

async function run() {
  const config = new ConfigService();
  const entities = [
    User,
    DoctorProfile,
    Patient,
    Consultation,
    ConsultationVitals,
    Prescription,
    PrescriptionMedication,
    PrescriptionPrintSnapshot,
    SafetyAlert,
    PharmacyDispatch,
    Medicine,
    MedicineContribution,
    InteractionResult,
    AuditEntry,
    Post,
    Testimonial,
    Partner,
    Specialty,
    WhyFeature,
  ];
  const synchronize = config.get<string>('DATABASE_SYNC', 'true') === 'true';
  const databaseType = config.get<string>('DATABASE_TYPE', 'sqlite');
  const databaseSsl = config.get<string>('DATABASE_SSL', 'false') === 'true';
  const rejectUnauthorized =
    config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'false') === 'true';
  const ssl = databaseSsl ? { rejectUnauthorized } : undefined;
  const options: DataSourceOptions =
    databaseType === 'postgres'
      ? {
          type: 'postgres',
          host: config.get<string>('DATABASE_HOST', 'localhost'),
          port: config.get<number>('DATABASE_PORT', 5432),
          username: config.get<string>('DATABASE_USER', 'postgres'),
          password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
          database: config.get<string>('DATABASE_NAME', 'medcity_connect'),
          ssl,
          extra: ssl ? { ssl } : undefined,
          synchronize,
          entities,
        }
      : (() => {
          const database = config.get<string>(
            'SQLITE_DATABASE',
            './data/medcity.sqlite',
          );
          mkdirSync(dirname(database), { recursive: true });
          return {
            type: 'sqlite',
            database,
            synchronize,
            entities,
          };
        })();
  const dataSource = new DataSource(options);

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const email = config.get<string>('SEED_ADMIN_EMAIL', 'admin@medcity.test');
  const password = config.get<string>('SEED_ADMIN_PASSWORD', 'Admin123!');
  const existing = await users.findOne({ where: { email } });

  if (!existing) {
    await users.save(
      users.create({
        email,
        role: UserRole.Admin,
        isActive: true,
        passwordHash: await bcrypt.hash(password, 12),
      }),
    );
    console.log(`Created admin user ${email}`);
  } else {
    console.log(`Admin user ${email} already exists`);
  }

  await dataSource.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
