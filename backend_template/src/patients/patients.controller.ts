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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../users/user.entity';
import {
  CreatePatientDto,
  PatientQueryDto,
  UpdatePatientDto,
} from './dto/patients.dto';
import { PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(@Query() query: PatientQueryDto, @CurrentUser() user: User) {
    return this.patientsService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.patientsService.getById(id, user);
  }

  @Post()
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: User) {
    return this.patientsService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: User,
  ) {
    return this.patientsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.patientsService.remove(id, user);
  }

  @Get(':id/consultations')
  consultations(@Param('id') id: string, @CurrentUser() user: User) {
    return this.patientsService.consultations(id, user);
  }

  @Get(':id/prescriptions')
  prescriptions(@Param('id') id: string, @CurrentUser() user: User) {
    return this.patientsService.prescriptions(id, user);
  }

  @Get(':id/vitals')
  vitals(@Param('id') id: string, @CurrentUser() user: User) {
    return this.patientsService.vitals(id, user);
  }
}
