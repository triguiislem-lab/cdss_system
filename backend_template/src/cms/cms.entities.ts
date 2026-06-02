import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CmsStatus } from '../common/entities/enums';

export enum ContactMessageStatus {
  New = 'new',
  Read = 'read',
  Resolved = 'resolved',
}

export enum NewsletterSubscriptionStatus {
  Active = 'active',
  Unsubscribed = 'unsubscribed',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  excerpt: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  category: string;

  @Column({ type: 'simple-json' })
  tags: string[];

  @Column()
  author: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ name: 'cover_color', nullable: true })
  coverColor?: string;

  @Column({ type: 'simple-enum', enum: CmsStatus, default: CmsStatus.Draft })
  status: CmsStatus;

  @Column({ default: false })
  featured: boolean;

  @Column({ name: 'published_at', nullable: true })
  publishedAt?: Date;

  @Column({ name: 'scheduled_date', nullable: true })
  scheduledDate?: Date;

  @Column({ default: 0 })
  views: number;

  @Column({ name: 'read_time', default: 1 })
  readTime: number;

  @Column({ name: 'comments_count', default: 0 })
  commentsCount: number;

  @Column({ name: 'meta_title', nullable: true })
  metaTitle?: string;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('testimonials')
export class Testimonial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  role: string;

  @Column({ type: 'text' })
  text: string;

  @Column()
  rating: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'logo_url' })
  logoUrl: string;

  @Column({ name: 'website_url', nullable: true })
  websiteUrl?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('specialties')
export class Specialty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'icon_name', nullable: true })
  iconName?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ nullable: true })
  bg?: string;

  @Column({ nullable: true })
  query?: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('why_features')
export class WhyFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'icon_name' })
  iconName: string;

  @Column()
  gradient: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('contact_messages')
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  subject?: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'public_contact' })
  source: string;

  @Column({ default: ContactMessageStatus.New })
  status: ContactMessageStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('newsletter_subscriptions')
export class NewsletterSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: 'footer' })
  source: string;

  @Column({ default: NewsletterSubscriptionStatus.Active })
  status: NewsletterSubscriptionStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
