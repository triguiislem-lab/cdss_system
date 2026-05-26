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
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../users/user.entity';
import {
  CreateDoctorDto,
  UpdateDoctorDto,
  UpdateDoctorStatusDto,
} from './dto/doctors.dto';
import { DoctorsService } from './doctors.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Roles(UserRole.Admin)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.doctorsService.findAll(query);
  }

  @Get('me/profile')
  me(@CurrentUser() user: User) {
    return this.doctorsService.getByUserId(user.id);
  }

  @Patch('me/profile')
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.updateOwnProfile(user.id, dto);
  }

  @Roles(UserRole.Admin)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.doctorsService.getById(id);
  }

  @Roles(UserRole.Admin)
  @Post()
  create(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.create(dto);
  }

  @Roles(UserRole.Admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.update(id, dto);
  }

  @Roles(UserRole.Admin)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.doctorsService.remove(id);
  }

  @Roles(UserRole.Admin)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorStatusDto,
  ) {
    return this.doctorsService.updateStatus(id, dto.status);
  }
}
