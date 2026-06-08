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
import { EmailService } from '../email/email.service';
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
    private readonly emailService: EmailService,
  ) {}

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const activeOnly = { status: DoctorStatus.Active };
    const where = query.search
      ? [
          { ...activeOnly, firstName: ILike(`%${query.search}%`) },
          { ...activeOnly, lastName: ILike(`%${query.search}%`) },
          { ...activeOnly, email: ILike(`%${query.search}%`) },
        ]
      : activeOnly;
    const [data, total] = await this.doctorsRepository.findAndCount({
      where,
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return toPaginated(data, total, page, limit);
  }

  async findPublic(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.search
      ? [
          { status: DoctorStatus.Active, firstName: ILike(`%${query.search}%`) },
          { status: DoctorStatus.Active, lastName: ILike(`%${query.search}%`) },
          { status: DoctorStatus.Active, specialty: ILike(`%${query.search}%`) },
          { status: DoctorStatus.Active, city: ILike(`%${query.search}%`) },
        ]
      : { status: DoctorStatus.Active };
    const [data, total] = await this.doctorsRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return toPaginated(
      data.map((doctor) => ({
        id: doctor.id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        phone: doctor.phone,
        specialty: doctor.specialty,
        city: doctor.city,
        address: doctor.address,
        status: doctor.status,
      })),
      total,
      page,
      limit,
    );
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
    const doctor = await this.doctorsRepository.findOne({
      where: { userId },
      relations: { user: true },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }
    return doctor;
  }

  async create(dto: CreateDoctorDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.usersRepository.findOne({
      where: { email },
      relations: { doctorProfile: true },
    });
    if (existing) {
      if (existing.role !== UserRole.Doctor || existing.isActive) {
        throw new ConflictException('Email already exists');
      }

      existing.passwordHash = await bcrypt.hash(dto.password, 12);
      existing.isActive = true;
      await this.usersRepository.save(existing);

      const { password: _password, ...profileData } = dto;
      const doctor = existing.doctorProfile
        ? Object.assign(existing.doctorProfile, {
            ...profileData,
            email,
            userId: existing.id,
            status: DoctorStatus.Active,
          })
        : this.doctorsRepository.create({
            ...profileData,
            email,
            userId: existing.id,
            status: DoctorStatus.Active,
          });

      const savedDoctor = await this.doctorsRepository.save(doctor);
      const credentialEmail = await this.emailService.sendDoctorCredentialsEmail({
        firstName: savedDoctor.firstName,
        lastName: savedDoctor.lastName,
        email: savedDoctor.email,
        password: dto.password,
      });
      return {
        ...savedDoctor,
        credentialEmail,
      };
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email,
        passwordHash,
        role: UserRole.Doctor,
        isActive: true,
      }),
    );

    const { password: _password, ...profileData } = dto;
    const doctor = await this.doctorsRepository.save(
      this.doctorsRepository.create({
        ...profileData,
        email,
        userId: user.id,
        status: DoctorStatus.Active,
      }),
    );
    const credentialEmail = await this.emailService.sendDoctorCredentialsEmail({
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      email: doctor.email,
      password: dto.password,
    });
    return {
      ...doctor,
      credentialEmail,
    };
  }

  async update(id: string, dto: UpdateDoctorDto) {
    const doctor = await this.getById(id);
    const { password, email, ...profileData } = dto;
    const normalizedEmail = email ? this.normalizeEmail(email) : undefined;
    let shouldSaveUser = false;
    if (normalizedEmail && normalizedEmail !== doctor.user.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== doctor.user.id) {
        throw new ConflictException('Email already exists');
      }
      doctor.user.email = normalizedEmail;
      doctor.email = normalizedEmail;
      shouldSaveUser = true;
    }
    Object.assign(doctor, profileData);
    if (password) {
      doctor.user.passwordHash = await bcrypt.hash(password, 12);
      shouldSaveUser = true;
    }
    if (shouldSaveUser) {
      await this.usersRepository.save(doctor.user);
    }
    doctor.email = doctor.user.email;
    return this.doctorsRepository.save(doctor);
  }

  async updateOwnProfile(userId: string, dto: UpdateDoctorDto) {
    const doctor = await this.getByUserId(userId);
    if ('password' in dto) {
      throw new ForbiddenException('Password changes are managed by admin');
    }
    const { email, ...profileData } = dto;
    const normalizedEmail = email ? this.normalizeEmail(email) : undefined;
    let shouldSaveUser = false;
    if (normalizedEmail && normalizedEmail !== doctor.user.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== doctor.user.id) {
        throw new ConflictException('Email already exists');
      }
      doctor.user.email = normalizedEmail;
      doctor.email = normalizedEmail;
      shouldSaveUser = true;
    }
    Object.assign(doctor, profileData);
    if (shouldSaveUser) {
      await this.usersRepository.save(doctor.user);
    }
    doctor.email = doctor.user.email;
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
    doctor.status = DoctorStatus.Inactive;
    doctor.user.isActive = false;
    await this.usersRepository.save(doctor.user);
    await this.doctorsRepository.save(doctor);
    return { ok: true };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
