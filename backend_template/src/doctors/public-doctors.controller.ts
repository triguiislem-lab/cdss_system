import { Controller, Get, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { DoctorsService } from './doctors.service';

@Controller('public/doctors')
export class PublicDoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.doctorsService.findPublic(query);
  }
}
