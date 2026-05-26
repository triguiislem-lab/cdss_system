import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  ContributionQueryDto,
  CreateMedicineContributionDto,
  RefuseContributionDto,
} from './dto/medicine-contributions.dto';
import { MedicineContributionsService } from './medicine-contributions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medicine-contributions')
export class MedicineContributionsController {
  constructor(
    private readonly contributionsService: MedicineContributionsService,
  ) {}

  @Get()
  findAll(@Query() query: ContributionQueryDto, @CurrentUser() user: User) {
    return this.contributionsService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contributionsService.getById(id);
  }

  @Post()
  @Roles(UserRole.Doctor)
  create(@Body() dto: CreateMedicineContributionDto, @CurrentUser() user: User) {
    return this.contributionsService.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contributionsService.remove(id);
  }

  @Post(':id/validate')
  @Roles(UserRole.Admin)
  validate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.contributionsService.validate(id, user);
  }

  @Post(':id/refuse')
  @Roles(UserRole.Admin)
  refuse(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: RefuseContributionDto,
  ) {
    return this.contributionsService.refuse(id, user, dto);
  }
}
