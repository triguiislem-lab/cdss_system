import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { ILike, Repository } from 'typeorm';
import { PaginationQueryDto, toPaginated } from '../common/dto/pagination.dto';
import { DoctorStatus, UserRole } from '../common/entities/enums';
import { User } from '../users/user.entity';
import { CreateDoctorDto, UpdateDoctorDto } from './dto/doctors.dto';
import { DoctorProfile } from './doctor-profile.entity';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(DoctorProfile)
    private readonly doctorsRepository: Repository<DoctorProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.search
      ? [
          { firstName: ILike(`%${query.search}%`) },
          { lastName: ILike(`%${query.search}%`) },
          { email: ILike(`%${query.search}%`) },
        ]
      : undefined;
    const [data, total] = await this.doctorsRepository.findAndCount({
      where,
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string) {
    const doctor = await this.doctorsRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    return doctor;
  }

  async getByUserId(userId: string) {
    const doctor = await this.doctorsRepository.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }
    return doctor;
  }

  async create(dto: CreateDoctorDto) {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email: dto.email,
        passwordHash,
        role: UserRole.Doctor,
      }),
    );

    const { password: _password, ...profileData } = dto;
    return this.doctorsRepository.save(
      this.doctorsRepository.create({
        ...profileData,
        userId: user.id,
        status: DoctorStatus.Active,
      }),
    );
  }

  async update(id: string, dto: UpdateDoctorDto) {
    const doctor = await this.getById(id);
    const { password, ...profileData } = dto;
    Object.assign(doctor, profileData);
    if (dto.email && dto.email !== doctor.user.email) {
      doctor.user.email = dto.email;
      await this.usersRepository.save(doctor.user);
    }
    if (password) {
      doctor.user.passwordHash = await bcrypt.hash(password, 12);
      await this.usersRepository.save(doctor.user);
    }
    return this.doctorsRepository.save(doctor);
  }

  async updateOwnProfile(userId: string, dto: UpdateDoctorDto) {
    const doctor = await this.getByUserId(userId);
    if ('password' in dto) {
      throw new ForbiddenException('Password changes are managed by admin');
    }
    Object.assign(doctor, dto);
    return this.doctorsRepository.save(doctor);
  }

  async updateStatus(id: string, status: DoctorStatus) {
    const doctor = await this.getById(id);
    doctor.status = status;
    doctor.user.isActive = status === DoctorStatus.Active;
    await this.usersRepository.save(doctor.user);
    return this.doctorsRepository.save(doctor);
  }

  async remove(id: string) {
    const doctor = await this.getById(id);
    await this.doctorsRepository.remove(doctor);
    return { ok: true };
  }
}
