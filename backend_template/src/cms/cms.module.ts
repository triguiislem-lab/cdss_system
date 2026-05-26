import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from './cms.entities';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { PublicController } from './public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post,
      Testimonial,
      Partner,
      Specialty,
      WhyFeature,
    ]),
  ],
  controllers: [CmsController, PublicController],
  providers: [CmsService],
})
export class CmsModule {}
