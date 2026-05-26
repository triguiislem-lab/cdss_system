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
import { ConsultationsService } from './consultations.service';
import {
  ConsultationQueryDto,
  CreateConsultationDto,
  CreateVitalsDto,
  UpdateConsultationDto,
} from './dto/consultations.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  findAll(@Query() query: ConsultationQueryDto, @CurrentUser() user: User) {
    return this.consultationsService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consultationsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateConsultationDto, @CurrentUser() user: User) {
    return this.consultationsService.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.consultationsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consultationsService.remove(id);
  }

  @Patch(':id/start')
  start(@Param('id') id: string) {
    return this.consultationsService.start(id);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.consultationsService.complete(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.consultationsService.cancel(id);
  }

  @Get(':id/vitals')
  vitals(@Param('id') id: string) {
    return this.consultationsService.vitals(id);
  }

  @Post(':id/vitals')
  createVitals(@Param('id') id: string, @Body() dto: CreateVitalsDto) {
    return this.consultationsService.createVitals(id, dto);
  }
}
