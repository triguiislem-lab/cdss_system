import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreatePharmacyDispatchDto,
  PharmacyDispatchQueryDto,
  UpdateDispatchStatusDto,
  UpdatePharmacyDispatchDto,
} from './dto/pharmacy.dto';
import { PharmacyService } from './pharmacy.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
@Controller('pharmacy/dispatches')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  findAll(@Query() query: PharmacyDispatchQueryDto) {
    return this.pharmacyService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pharmacyService.getById(id);
  }

  @Post()
  create(@Body() dto: CreatePharmacyDispatchDto) {
    return this.pharmacyService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePharmacyDispatchDto) {
    return this.pharmacyService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pharmacyService.remove(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDispatchStatusDto) {
    return this.pharmacyService.updateStatus(id, dto.status);
  }
}
