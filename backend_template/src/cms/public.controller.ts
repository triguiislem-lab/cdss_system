import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CmsService } from './cms.service';
import {
  CreateContactMessageDto,
  CreateNewsletterSubscriptionDto,
} from './dto/cms.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('home')
  home() {
    return this.cmsService.publicHome();
  }

  @Get('posts')
  posts() {
    return this.cmsService.publicPosts();
  }

  @Get('posts/:slug')
  post(@Param('slug') slug: string) {
    return this.cmsService.publicPost(slug);
  }

  @Get('testimonials')
  testimonials() {
    return this.cmsService.publicTestimonials();
  }

  @Get('partners')
  partners() {
    return this.cmsService.publicPartners();
  }

  @Get('specialties')
  specialties() {
    return this.cmsService.publicSpecialties();
  }

  @Post('contact-messages')
  createContactMessage(@Body() dto: CreateContactMessageDto) {
    return this.cmsService.createContactMessage(dto);
  }

  @Post('newsletter-subscriptions')
  createNewsletterSubscription(@Body() dto: CreateNewsletterSubscriptionDto) {
    return this.cmsService.createNewsletterSubscription(dto);
  }
}
