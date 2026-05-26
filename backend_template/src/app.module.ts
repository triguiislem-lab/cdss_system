import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CdssModule } from './cdss/cdss.module';
import { CmsModule } from './cms/cms.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { DoctorsModule } from './doctors/doctors.module';
import { HealthModule } from './health/health.module';
import { InteractionsModule } from './interactions/interactions.module';
import { MedicineContributionsModule } from './medicine-contributions/medicine-contributions.module';
import { MedicinesModule } from './medicines/medicines.module';
import { PatientsModule } from './patients/patients.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { TranslationModule } from './translation/translation.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const synchronize =
          config.get<string>('DATABASE_SYNC', 'true') === 'true';
        const databaseType = config.get<string>('DATABASE_TYPE', 'sqlite');
        const databaseSsl =
          config.get<string>('DATABASE_SSL', 'false') === 'true';
        const rejectUnauthorized =
          config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'false') ===
          'true';
        const ssl = databaseSsl ? { rejectUnauthorized } : undefined;

        if (databaseType === 'postgres') {
          return {
            type: 'postgres',
            host: config.get<string>('DATABASE_HOST', 'localhost'),
            port: config.get<number>('DATABASE_PORT', 5432),
            username: config.get<string>('DATABASE_USER', 'postgres'),
            password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
            database: config.get<string>('DATABASE_NAME', 'medcity_connect'),
            ssl,
            extra: ssl ? { ssl } : undefined,
            autoLoadEntities: true,
            synchronize,
          };
        }

        const database = config.get<string>(
          'SQLITE_DATABASE',
          './data/medcity.sqlite',
        );
        mkdirSync(dirname(database), { recursive: true });

        return {
          type: 'sqlite',
          database,
          autoLoadEntities: true,
          synchronize,
        };
      },
    }),
    AuthModule,
    HealthModule,
    UsersModule,
    DoctorsModule,
    PatientsModule,
    ConsultationsModule,
    PrescriptionsModule,
    PharmacyModule,
    MedicinesModule,
    MedicineContributionsModule,
    InteractionsModule,
    AuditModule,
    CdssModule,
    CmsModule,
    TranslationModule,
  ],
})
export class AppModule {}
