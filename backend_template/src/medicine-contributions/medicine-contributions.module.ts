import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorsModule } from '../doctors/doctors.module';
import { Medicine } from '../medicines/medicine.entity';
import { MedicineContribution } from './medicine-contribution.entity';
import { MedicineContributionsController } from './medicine-contributions.controller';
import { MedicineContributionsService } from './medicine-contributions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MedicineContribution, Medicine]),
    DoctorsModule,
  ],
  controllers: [MedicineContributionsController],
  providers: [MedicineContributionsService],
})
export class MedicineContributionsModule {}
