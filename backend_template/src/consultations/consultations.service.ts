import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import { ConsultationStatus, UserRole } from '../common/entities/enums';
import { DoctorsService } from '../doctors/doctors.service';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { ConsultationVitals } from './consultation-vitals.entity';
import { Consultation } from './consultation.entity';
import {
  ConsultationQueryDto,
  CreateConsultationDto,
  CreateVitalsDto,
  UpdateConsultationDto,
} from './dto/consultations.dto';

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    @InjectRepository(ConsultationVitals)
    private readonly vitalsRepository: Repository<ConsultationVitals>,
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    private readonly doctorsService: DoctorsService,
  ) {}

  async findAll(query: ConsultationQueryDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const doctor =
      user.role === UserRole.Doctor
        ? await this.doctorsService.getByUserId(user.id)
        : undefined;

    const qb = this.consultationsRepository
      .createQueryBuilder('consultation')
      .leftJoinAndSelect('consultation.patient', 'patient')
      .leftJoinAndSelect('consultation.doctor', 'doctor');

    if (doctor) {
      qb.andWhere('consultation.doctorId = :doctorId', {
        doctorId: doctor.id,
      });
    } else if (query.doctorId) {
      qb.andWhere('consultation.doctorId = :doctorId', {
        doctorId: query.doctorId,
      });
    }
    if (query.patientId) {
      qb.andWhere('consultation.patientId = :patientId', {
        patientId: query.patientId,
      });
    }
    if (query.status) {
      qb.andWhere('consultation.status = :status', { status: query.status });
    }

    const [data, total] = await qb
      .orderBy('consultation.scheduledAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string) {
    const consultation = await this.consultationsRepository.findOne({
      where: { id },
      relations: { patient: true, doctor: true, vitals: true },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    return consultation;
  }

  async create(dto: CreateConsultationDto, user: User) {
    const doctorId =
      user.role === UserRole.Doctor
        ? (await this.doctorsService.getByUserId(user.id)).id
        : dto.doctorId;
    if (!doctorId) {
      throw new BadRequestException('Admin-created consultations require doctorId');
    }

    const patient = await this.patientsRepository.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (
      user.role === UserRole.Doctor &&
      patient.ownerDoctorId &&
      patient.ownerDoctorId !== doctorId
    ) {
      throw new NotFoundException('Patient not found');
    }
    if (!patient.ownerDoctorId) {
      patient.ownerDoctorId = doctorId;
      await this.patientsRepository.save(patient);
    }

    return this.consultationsRepository.save(
      this.consultationsRepository.create({
        ...dto,
        doctorId,
        status: ConsultationStatus.Scheduled,
      }),
    );
  }

  async update(id: string, dto: UpdateConsultationDto) {
    const consultation = await this.getById(id);
    Object.assign(consultation, dto);
    return this.consultationsRepository.save(consultation);
  }

  async remove(id: string) {
    const consultation = await this.getById(id);
    await this.consultationsRepository.remove(consultation);
    return { ok: true };
  }

  async start(id: string) {
    const consultation = await this.getById(id);
    consultation.status = ConsultationStatus.InProgress;
    consultation.startedAt = new Date();
    return this.consultationsRepository.save(consultation);
  }

  async complete(id: string) {
    const consultation = await this.getById(id);
    consultation.status = ConsultationStatus.Completed;
    consultation.endedAt = new Date();
    return this.consultationsRepository.save(consultation);
  }

  async cancel(id: string) {
    const consultation = await this.getById(id);
    consultation.status = ConsultationStatus.Cancelled;
    return this.consultationsRepository.save(consultation);
  }

  async vitals(id: string) {
    await this.getById(id);
    return this.vitalsRepository.find({
      where: { consultationId: id },
      order: { measuredAt: 'DESC' },
    });
  }

  async createVitals(id: string, dto: CreateVitalsDto) {
    const consultation = await this.getById(id);
    return this.vitalsRepository.save(
      this.vitalsRepository.create({
        ...dto,
        consultationId: id,
        patientId: consultation.patientId,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      }),
    );
  }
}
