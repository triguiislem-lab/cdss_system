import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Medicine } from './medicine.entity';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';
import { PublicMedicinesController } from './public-medicines.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine])],
  controllers: [MedicinesController, PublicMedicinesController],
  providers: [MedicinesService],
  exports: [MedicinesService, TypeOrmModule],
})
export class MedicinesModule {}
