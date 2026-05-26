import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckInteractionsDto, InteractionQueryDto } from './dto/interactions.dto';
import { InteractionsService } from './interactions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post('check')
  check(@Body() dto: CheckInteractionsDto) {
    return this.interactionsService.check(dto);
  }

  @Get()
  findAll(@Query() query: InteractionQueryDto) {
    return this.interactionsService.findAll(query);
  }
}
