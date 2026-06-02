import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import {
  ContributionKind,
  ContributionStatus,
  UserRole,
} from '../common/entities/enums';
import { DoctorsService } from '../doctors/doctors.service';
import { Medicine } from '../medicines/medicine.entity';
import { User } from '../users/user.entity';
import {
  ContributionQueryDto,
  CreateMedicineContributionDto,
  RefuseContributionDto,
} from './dto/medicine-contributions.dto';
import { MedicineContribution } from './medicine-contribution.entity';

@Injectable()
export class MedicineContributionsService {
  constructor(
    @InjectRepository(MedicineContribution)
    private readonly contributionsRepository: Repository<MedicineContribution>,
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
    private readonly doctorsService: DoctorsService,
  ) {}

  async findAll(query: ContributionQueryDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.contributionsRepository
      .createQueryBuilder('contribution')
      .leftJoinAndSelect('contribution.author', 'author')
      .leftJoinAndSelect('contribution.targetMedicine', 'medicine');

    if (user.role === UserRole.Doctor) {
      const doctor = await this.doctorsService.getByUserId(user.id);
      qb.andWhere('contribution.authorDoctorId = :doctorId', {
        doctorId: doctor.id,
      });
    }
    if (query.status) {
      qb.andWhere('contribution.status = :status', { status: query.status });
    }
    if (query.kind) {
      qb.andWhere('contribution.kind = :kind', { kind: query.kind });
    }
    if (query.search) {
      qb.andWhere('LOWER(contribution.authorName) LIKE :search', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('contribution.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string) {
    const contribution = await this.contributionsRepository.findOne({
      where: { id },
      relations: { author: true, targetMedicine: true },
    });
    if (!contribution) {
      throw new NotFoundException('Medicine contribution not found');
    }
    return contribution;
  }

  async create(dto: CreateMedicineContributionDto, user: User) {
    const doctor = await this.doctorsService.getByUserId(user.id);
    const targetMedicine = dto.targetMedicineId
      ? await this.medicinesRepository.findOne({
          where: { id: dto.targetMedicineId },
        })
      : undefined;
    return this.contributionsRepository.save(
      this.contributionsRepository.create({
        ...dto,
        authorDoctorId: doctor.id,
        authorEmail: doctor.email,
        authorName: `${doctor.firstName} ${doctor.lastName}`,
        targetMedicineDci: targetMedicine?.dci,
        status: ContributionStatus.Pending,
      }),
    );
  }

  async validate(id: string, reviewer: User) {
    const contribution = await this.getById(id);
    contribution.status = ContributionStatus.Validated;
    contribution.reviewerAdminId = reviewer.id;
    contribution.reviewerEmail = reviewer.email;
    contribution.reviewerName = reviewer.email;
    contribution.reviewedAt = new Date();

    const newMedicine = contribution.newMedicine as
      | Partial<Medicine>
      | undefined;
    if (contribution.kind === ContributionKind.NewMedicine && newMedicine?.dci) {
      await this.medicinesRepository.save(
        this.medicinesRepository.create(newMedicine),
      );
    }

    return this.contributionsRepository.save(contribution);
  }

  async refuse(id: string, reviewer: User, dto: RefuseContributionDto) {
    const contribution = await this.getById(id);
    contribution.status = ContributionStatus.Refused;
    contribution.reviewerAdminId = reviewer.id;
    contribution.reviewerEmail = reviewer.email;
    contribution.reviewerName = reviewer.email;
    contribution.reviewedAt = new Date();
    contribution.refusalReason = dto.refusalReason;
    return this.contributionsRepository.save(contribution);
  }

  async remove(id: string) {
    const contribution = await this.getById(id);
    await this.contributionsRepository.remove(contribution);
    return { ok: true };
  }
}
