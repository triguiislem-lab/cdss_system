import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(UserRole.Admin)
  @Get('admin')
  admin() {
    return this.dashboardService.adminSummary();
  }

  @Roles(UserRole.Doctor)
  @Get('doctor')
  doctor(@CurrentUser() user: User) {
    return this.dashboardService.doctorSummary(user.id);
  }
}
