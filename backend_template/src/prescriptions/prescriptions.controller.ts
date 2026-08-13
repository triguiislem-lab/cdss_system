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
  RecordPrescriptionSafetyActionDto,
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
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.getById(id, user);
  }

  @Post()
  create(@Body() dto: CreatePrescriptionDto, @CurrentUser() user: User) {
    return this.prescriptionsService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.remove(id, user);
  }

  @Post(':id/medications')
  addMedication(
    @Param('id') id: string,
    @Body() dto: MedicationLineDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.addMedication(id, dto, user);
  }

  @Patch(':id/medications/:medicationId')
  updateMedication(
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body() dto: MedicationLineDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.updateMedication(id, medicationId, dto, user);
  }

  @Delete(':id/medications/:medicationId')
  removeMedication(
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.removeMedication(id, medicationId, user);
  }

  @Post(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.validate(id, user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.reject(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.cancel(id, user);
  }

  @Post(':id/print-snapshot')
  printSnapshot(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.createPrintSnapshot(id, user);
  }

  @Get(':id/ordonnance')
  ordonnance(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.ordonnance(id, user);
  }

  @Post(':id/send-to-pharmacy')
  sendToPharmacy(
    @Param('id') id: string,
    @Body() dto: SendPrescriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.sendToPharmacy(id, dto, user);
  }

  @Post(':id/send-to-patient')
  sendToPatient(
    @Param('id') id: string,
    @Body() dto: SendPrescriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.sendToPatient(id, dto, user);
  }

  @Post(':id/safety-check')
  safetyCheck(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.safetyCheck(id, user);
  }

  @Get(':id/safety-alerts')
  safetyAlerts(@Param('id') id: string, @CurrentUser() user: User) {
    return this.prescriptionsService.safetyAlerts(id, user);
  }

  @Post(':id/safety-actions')
  recordSafetyAction(
    @Param('id') id: string,
    @Body() dto: RecordPrescriptionSafetyActionDto,
    @CurrentUser() user: User,
  ) {
    return this.prescriptionsService.recordSafetyAction(id, dto, user);
  }
}
