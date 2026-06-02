import { Controller, Get, Param, Query } from '@nestjs/common';
import { MedicineQueryDto } from './dto/medicines.dto';
import { MedicinesService } from './medicines.service';

@Controller('public/medicines')
export class PublicMedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  findAll(@Query() query: MedicineQueryDto) {
    return this.medicinesService.findAll(query);
  }

  @Get('classes')
  classes() {
    return this.medicinesService.classes();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.medicinesService.getById(id);
  }
}
