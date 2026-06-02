import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import {
  ContactMessage,
  NewsletterSubscription,
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
    EmailModule,
    TypeOrmModule.forFeature([
      Post,
      Testimonial,
      Partner,
      Specialty,
      WhyFeature,
      ContactMessage,
      NewsletterSubscription,
    ]),
  ],
  controllers: [CmsController, PublicController],
  providers: [CmsService],
})
export class CmsModule {}
