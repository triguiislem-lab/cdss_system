import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CmsStatus } from '../common/entities/enums';
import { EmailService } from '../email/email.service';
import {
  ContactMessage,
  ContactMessageStatus,
  NewsletterSubscription,
  NewsletterSubscriptionStatus,
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from './cms.entities';
import {
  CreateContactMessageDto,
  CreateNewsletterSubscriptionDto,
} from './dto/cms.dto';

type CmsRepository<T extends { id: string }> = Repository<T>;
type CmsWrite = object;

@Injectable()
export class CmsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Testimonial)
    private readonly testimonials: Repository<Testimonial>,
    @InjectRepository(Partner) private readonly partners: Repository<Partner>,
    @InjectRepository(Specialty)
    private readonly specialties: Repository<Specialty>,
    @InjectRepository(WhyFeature)
    private readonly whyFeatures: Repository<WhyFeature>,
    @InjectRepository(ContactMessage)
    private readonly contactMessages: Repository<ContactMessage>,
    @InjectRepository(NewsletterSubscription)
    private readonly newsletterSubscriptions: Repository<NewsletterSubscription>,
    private readonly emailService: EmailService,
  ) {}

  listPosts() {
    return this.posts.find({ order: { createdAt: 'DESC' } });
  }

  async getPost(id: string) {
    return this.getById(this.posts, id, 'Post');
  }

  createPost(data: CmsWrite) {
    return this.posts.save(this.posts.create(data as Partial<Post>));
  }

  async updatePost(id: string, data: CmsWrite) {
    return this.update(this.posts, id, data as Partial<Post>, 'Post');
  }

  removePost(id: string) {
    return this.remove(this.posts, id, 'Post');
  }

  listTestimonials() {
    return this.testimonials.find({ order: { createdAt: 'DESC' } });
  }

  createTestimonial(data: CmsWrite) {
    return this.testimonials.save(
      this.testimonials.create(data as Partial<Testimonial>),
    );
  }

  updateTestimonial(id: string, data: CmsWrite) {
    return this.update(
      this.testimonials,
      id,
      data as Partial<Testimonial>,
      'Testimonial',
    );
  }

  removeTestimonial(id: string) {
    return this.remove(this.testimonials, id, 'Testimonial');
  }

  listPartners() {
    return this.partners.find({ order: { createdAt: 'DESC' } });
  }

  createPartner(data: CmsWrite) {
    return this.partners.save(this.partners.create(data as Partial<Partner>));
  }

  updatePartner(id: string, data: CmsWrite) {
    return this.update(this.partners, id, data as Partial<Partner>, 'Partner');
  }

  removePartner(id: string) {
    return this.remove(this.partners, id, 'Partner');
  }

  listSpecialties() {
    return this.specialties.find({ order: { createdAt: 'DESC' } });
  }

  createSpecialty(data: CmsWrite) {
    return this.specialties.save(
      this.specialties.create(data as Partial<Specialty>),
    );
  }

  updateSpecialty(id: string, data: CmsWrite) {
    return this.update(
      this.specialties,
      id,
      data as Partial<Specialty>,
      'Specialty',
    );
  }

  removeSpecialty(id: string) {
    return this.remove(this.specialties, id, 'Specialty');
  }

  listWhyFeatures() {
    return this.whyFeatures.find({ order: { createdAt: 'DESC' } });
  }

  createWhyFeature(data: CmsWrite) {
    return this.whyFeatures.save(
      this.whyFeatures.create(data as Partial<WhyFeature>),
    );
  }

  updateWhyFeature(id: string, data: CmsWrite) {
    return this.update(
      this.whyFeatures,
      id,
      data as Partial<WhyFeature>,
      'Why feature',
    );
  }

  removeWhyFeature(id: string) {
    return this.remove(this.whyFeatures, id, 'Why feature');
  }

  listContactMessages() {
    return this.contactMessages.find({ order: { createdAt: 'DESC' } });
  }

  async createContactMessage(data: CreateContactMessageDto) {
    const message = await this.contactMessages.save(
      this.contactMessages.create({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        subject: data.subject?.trim() || undefined,
        message: data.message.trim(),
        source: data.source?.trim() || 'public_contact',
        status: ContactMessageStatus.New,
      }),
    );
    void this.emailService.sendContactMessageNotification(message);
    return message;
  }

  async updateContactMessageStatus(
    id: string,
    status: ContactMessageStatus,
  ) {
    return this.update(this.contactMessages, id, { status }, 'Contact message');
  }

  listNewsletterSubscriptions() {
    return this.newsletterSubscriptions.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createNewsletterSubscription(data: CreateNewsletterSubscriptionDto) {
    const email = data.email.trim().toLowerCase();
    const existing = await this.newsletterSubscriptions.findOne({
      where: { email },
    });

    if (existing) {
      existing.status = NewsletterSubscriptionStatus.Active;
      existing.source = data.source?.trim() || existing.source || 'footer';
      const subscription = await this.newsletterSubscriptions.save(existing);
      void this.emailService.sendNewsletterSubscriptionEmails(subscription);
      return subscription;
    }

    const subscription = await this.newsletterSubscriptions.save(
      this.newsletterSubscriptions.create({
        email,
        source: data.source?.trim() || 'footer',
        status: NewsletterSubscriptionStatus.Active,
      }),
    );
    void this.emailService.sendNewsletterSubscriptionEmails(subscription);
    return subscription;
  }

  async publicHome() {
    const [posts, testimonials, partners, specialties, whyFeatures] =
      await Promise.all([
        this.posts.find({
          where: { status: CmsStatus.Published },
          order: { featured: 'DESC', publishedAt: 'DESC' },
          take: 6,
        }),
        this.testimonials.find({ where: { active: true }, take: 6 }),
        this.partners.find({ where: { active: true } }),
        this.specialties.find({ where: { active: true } }),
        this.whyFeatures.find({ where: { active: true } }),
      ]);
    return { posts, testimonials, partners, specialties, whyFeatures };
  }

  publicPosts() {
    return this.posts.find({
      where: { status: CmsStatus.Published },
      order: { publishedAt: 'DESC' },
    });
  }

  async publicPost(slug: string) {
    const post = await this.posts.findOne({
      where: { slug, status: CmsStatus.Published },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    post.views += 1;
    return this.posts.save(post);
  }

  publicTestimonials() {
    return this.testimonials.find({ where: { active: true } });
  }

  publicPartners() {
    return this.partners.find({ where: { active: true } });
  }

  publicSpecialties() {
    return this.specialties.find({ where: { active: true } });
  }

  private async getById<T extends { id: string }>(
    repository: CmsRepository<T>,
    id: string,
    label: string,
  ) {
    const item = await repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });
    if (!item) {
      throw new NotFoundException(`${label} not found`);
    }
    return item;
  }

  private async update<T extends { id: string }>(
    repository: CmsRepository<T>,
    id: string,
    data: Partial<T>,
    label: string,
  ) {
    const item = await this.getById(repository, id, label);
    Object.assign(item, data);
    return repository.save(item);
  }

  private async remove<T extends { id: string }>(
    repository: CmsRepository<T>,
    id: string,
    label: string,
  ) {
    const item = await this.getById(repository, id, label);
    await repository.remove(item);
    return { ok: true };
  }
}
