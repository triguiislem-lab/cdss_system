import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { CmsStatus } from '../../common/entities/enums';
import { ContactMessageStatus } from '../cms.entities';

export class CreatePostDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsString()
  excerpt: string;

  @IsString()
  content: string;

  @IsString()
  category: string;

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsString()
  author: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  coverColor?: string;

  @IsOptional()
  @IsEnum(CmsStatus)
  status?: CmsStatus;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsInt()
  views?: number;

  @IsOptional()
  @IsInt()
  readTime?: number;

  @IsOptional()
  @IsInt()
  commentsCount?: number;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;
}

export class UpdatePostDto extends PartialType(CreatePostDto) {}

export class CreateTestimonialDto {
  @IsString()
  name: string;

  @IsString()
  role: string;

  @IsString()
  text: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTestimonialDto extends PartialType(CreateTestimonialDto) {}

export class CreatePartnerDto {
  @IsString()
  name: string;

  @IsString()
  logoUrl: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}

export class CreateSpecialtyDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  iconName?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  bg?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}

export class CreateWhyFeatureDto {
  @IsString()
  iconName: string;

  @IsString()
  gradient: string;

  @IsString()
  title: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWhyFeatureDto extends PartialType(CreateWhyFeatureDto) {}

export class CreateContactMessageDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  subject?: string;

  @IsString()
  @Length(5, 4000)
  message: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  source?: string;
}

export class UpdateContactMessageStatusDto {
  @IsIn(Object.values(ContactMessageStatus))
  status: ContactMessageStatus;
}

export class CreateNewsletterSubscriptionDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  source?: string;
}
