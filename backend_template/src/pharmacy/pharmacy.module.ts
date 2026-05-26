import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prescription } from '../prescriptions/prescription.entity';
import { PharmacyDispatch } from './pharmacy-dispatch.entity';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [TypeOrmModule.forFeature([PharmacyDispatch, Prescription])],
  controllers: [PharmacyController],
  providers: [PharmacyService],
  exports: [PharmacyService, TypeOrmModule],
})
export class PharmacyModule {}
