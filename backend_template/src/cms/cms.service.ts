import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsStatus } from '../common/entities/enums';
import {
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from './cms.entities';

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
    const item = await repository.findOne({ where: { id } as any });
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
