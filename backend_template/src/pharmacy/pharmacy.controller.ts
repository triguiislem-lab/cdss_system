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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../users/user.entity';
import {
  CreatePharmacyDispatchDto,
  PharmacyDispatchQueryDto,
  UpdateDispatchStatusDto,
  UpdatePharmacyDispatchDto,
} from './dto/pharmacy.dto';
import { PharmacyService } from './pharmacy.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Doctor)
@Controller('pharmacy/dispatches')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  findAll(@Query() query: PharmacyDispatchQueryDto, @CurrentUser() user: User) {
    return this.pharmacyService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.pharmacyService.getById(id, user);
  }

  @Post()
  create(@Body() dto: CreatePharmacyDispatchDto, @CurrentUser() user: User) {
    return this.pharmacyService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePharmacyDispatchDto,
    @CurrentUser() user: User,
  ) {
    return this.pharmacyService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.pharmacyService.remove(id, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDispatchStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.pharmacyService.updateStatus(id, dto.status, user);
  }
}
