import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Medicine } from './medicine.entity';
import { FirebaseMedicinesCatalog } from './firebase-medicines.catalog';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';
import { PublicMedicinesController } from './public-medicines.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine])],
  controllers: [MedicinesController, PublicMedicinesController],
  providers: [FirebaseMedicinesCatalog, MedicinesService],
  exports: [MedicinesService, FirebaseMedicinesCatalog, TypeOrmModule],
})
export class MedicinesModule {}
