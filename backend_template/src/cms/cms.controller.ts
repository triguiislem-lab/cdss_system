import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CmsService } from './cms.service';
import {
  CreatePartnerDto,
  CreatePostDto,
  CreateSpecialtyDto,
  CreateTestimonialDto,
  CreateWhyFeatureDto,
  SendNewsletterCampaignDto,
  UpdateContactMessageStatusDto,
  UpdatePartnerDto,
  UpdatePostDto,
  UpdateSpecialtyDto,
  UpdateTestimonialDto,
  UpdateWhyFeatureDto,
} from './dto/cms.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
@Controller('cms')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('posts')
  posts() {
    return this.cmsService.listPosts();
  }

  @Get('posts/:id')
  post(@Param('id') id: string) {
    return this.cmsService.getPost(id);
  }

  @Post('posts')
  createPost(@Body() dto: CreatePostDto) {
    return this.cmsService.createPost(dto);
  }

  @Patch('posts/:id')
  updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.cmsService.updatePost(id, dto);
  }

  @Delete('posts/:id')
  removePost(@Param('id') id: string) {
    return this.cmsService.removePost(id);
  }

  @Get('testimonials')
  testimonials() {
    return this.cmsService.listTestimonials();
  }

  @Post('testimonials')
  createTestimonial(@Body() dto: CreateTestimonialDto) {
    return this.cmsService.createTestimonial(dto);
  }

  @Patch('testimonials/:id')
  updateTestimonial(
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
  ) {
    return this.cmsService.updateTestimonial(id, dto);
  }

  @Delete('testimonials/:id')
  removeTestimonial(@Param('id') id: string) {
    return this.cmsService.removeTestimonial(id);
  }

  @Get('partners')
  partners() {
    return this.cmsService.listPartners();
  }

  @Post('partners')
  createPartner(@Body() dto: CreatePartnerDto) {
    return this.cmsService.createPartner(dto);
  }

  @Patch('partners/:id')
  updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.cmsService.updatePartner(id, dto);
  }

  @Delete('partners/:id')
  removePartner(@Param('id') id: string) {
    return this.cmsService.removePartner(id);
  }

  @Get('specialties')
  specialties() {
    return this.cmsService.listSpecialties();
  }

  @Post('specialties')
  createSpecialty(@Body() dto: CreateSpecialtyDto) {
    return this.cmsService.createSpecialty(dto);
  }

  @Patch('specialties/:id')
  updateSpecialty(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
    return this.cmsService.updateSpecialty(id, dto);
  }

  @Delete('specialties/:id')
  removeSpecialty(@Param('id') id: string) {
    return this.cmsService.removeSpecialty(id);
  }

  @Get('why-features')
  whyFeatures() {
    return this.cmsService.listWhyFeatures();
  }

  @Post('why-features')
  createWhyFeature(@Body() dto: CreateWhyFeatureDto) {
    return this.cmsService.createWhyFeature(dto);
  }

  @Patch('why-features/:id')
  updateWhyFeature(@Param('id') id: string, @Body() dto: UpdateWhyFeatureDto) {
    return this.cmsService.updateWhyFeature(id, dto);
  }

  @Delete('why-features/:id')
  removeWhyFeature(@Param('id') id: string) {
    return this.cmsService.removeWhyFeature(id);
  }

  @Get('contact-messages')
  contactMessages() {
    return this.cmsService.listContactMessages();
  }

  @Patch('contact-messages/:id/status')
  updateContactMessageStatus(
    @Param('id') id: string,
    @Body() dto: UpdateContactMessageStatusDto,
  ) {
    return this.cmsService.updateContactMessageStatus(id, dto.status);
  }

  @Get('newsletter-subscriptions')
  newsletterSubscriptions() {
    return this.cmsService.listNewsletterSubscriptions();
  }

  @Post('newsletter-subscriptions/send-campaign')
  sendNewsletterCampaign(@Body() dto: SendNewsletterCampaignDto) {
    return this.cmsService.sendNewsletterCampaign(dto);
  }
}
