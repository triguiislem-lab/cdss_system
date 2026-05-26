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
  CreatePrescriptionDto,
  MedicationLineDto,
  PrescriptionQueryDto,
  SendPrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescriptions.dto';
import { PrescriptionsService } from './prescriptions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get()
  findAll(@Query() query: PrescriptionQueryDto, @CurrentUser() user: User) {
    return this.prescriptionsService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreatePrescriptionDto, @CurrentUser() user: User) {
    return this.prescriptionsService.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePrescriptionDto) {
    return this.prescriptionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prescriptionsService.remove(id);
  }

  @Post(':id/medications')
  addMedication(@Param('id') id: string, @Body() dto: MedicationLineDto) {
    return this.prescriptionsService.addMedication(id, dto);
  }

  @Patch(':id/medications/:medicationId')
  updateMedication(
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body() dto: MedicationLineDto,
  ) {
    return this.prescriptionsService.updateMedication(id, medicationId, dto);
  }

  @Delete(':id/medications/:medicationId')
  removeMedication(
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
  ) {
    return this.prescriptionsService.removeMedication(id, medicationId);
  }

  @Post(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.validate(id, user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.reject(id, user);
  }

  @Post(':id/print-snapshot')
  printSnapshot(@Param('id') id: string) {
    return this.prescriptionsService.createPrintSnapshot(id);
  }

  @Get(':id/ordonnance')
  ordonnance(@Param('id') id: string) {
    return this.prescriptionsService.ordonnance(id);
  }

  @Post(':id/send-to-pharmacy')
  sendToPharmacy(@Param('id') id: string, @Body() dto: SendPrescriptionDto) {
    return this.prescriptionsService.sendToPharmacy(id, dto);
  }

  @Post(':id/send-to-patient')
  sendToPatient(@Param('id') id: string, @Body() dto: SendPrescriptionDto) {
    return this.prescriptionsService.sendToPatient(id, dto);
  }

  @Post(':id/safety-check')
  safetyCheck(@Param('id') id: string) {
    return this.prescriptionsService.safetyCheck(id);
  }

  @Get(':id/safety-alerts')
  safetyAlerts(@Param('id') id: string) {
    return this.prescriptionsService.safetyAlerts(id);
  }
}
