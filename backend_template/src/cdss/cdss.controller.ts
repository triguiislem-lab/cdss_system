import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User } from '../users/user.entity';
import { CdssService } from './cdss.service';
import {
  CdssKgSearchQueryDto,
  CdssSearchQueryDto,
  DraftCdssPrescriptionDto,
  ValidateCdssPlanDto,
} from './dto/cdss.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cdss')
export class CdssController {
  constructor(private readonly cdssService: CdssService) {}

  @Post('prescriptions/draft')
  draft(@Body() dto: DraftCdssPrescriptionDto, @CurrentUser() user: User) {
    return this.cdssService.draft(dto, user);
  }

  @Post('prescriptions/analyze')
  analyze(@Body() dto: DraftCdssPrescriptionDto) {
    return this.cdssService.analyze(dto);
  }

  @Post('prescriptions/validate-plan')
  validatePlan(@Body() dto: ValidateCdssPlanDto) {
    return this.cdssService.validatePlan(dto);
  }

  @Get('formulary/search')
  searchFormulary(@Query() query: CdssSearchQueryDto) {
    return this.cdssService.searchFormulary(query.query, query.limit);
  }

  @Get('kg/search')
  searchKg(@Query() query: CdssKgSearchQueryDto) {
    return this.cdssService.searchKg(query.query, query.limit, {
      route: query.route,
      disease: query.disease,
    });
  }

  @Get('prescriptions/audit/:traceId')
  fetchIaAudit(@Param('traceId') traceId: string) {
    return this.cdssService.fetchIaAudit(traceId);
  }
}
