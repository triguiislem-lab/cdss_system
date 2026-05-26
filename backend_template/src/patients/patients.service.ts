import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { toPaginated } from '../common/dto/pagination.dto';
import { Prescription } from '../prescriptions/prescription.entity';
import {
  CreatePatientDto,
  PatientQueryDto,
  UpdatePatientDto,
} from './dto/patients.dto';
import { Patient } from './patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    @InjectRepository(Prescription)
    private readonly prescriptionsRepository: Repository<Prescription>,
    @InjectRepository(ConsultationVitals)
    private readonly vitalsRepository: Repository<ConsultationVitals>,
  ) {}

  async findAll(query: PatientQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.patientsRepository.createQueryBuilder('patient');

    if (query.search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('patient.firstName ILIKE :search')
            .orWhere('patient.lastName ILIKE :search')
            .orWhere('patient.phone1 ILIKE :search')
            .orWhere('patient.internalCode ILIKE :search');
        }),
      ).setParameter('search', `%${query.search}%`);
    }
    if (query.gender) {
      qb.andWhere('patient.gender = :gender', { gender: query.gender });
    }

    const [data, total] = await qb
      .orderBy('patient.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string) {
    const patient = await this.patientsRepository.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  create(dto: CreatePatientDto) {
    return this.patientsRepository.save(this.patientsRepository.create(dto));
  }

  async update(id: string, dto: UpdatePatientDto) {
    const patient = await this.getById(id);
    Object.assign(patient, dto);
    return this.patientsRepository.save(patient);
  }

  async remove(id: string) {
    const patient = await this.getById(id);
    await this.patientsRepository.remove(patient);
    return { ok: true };
  }

  async consultations(id: string) {
    await this.getById(id);
    return this.consultationsRepository.find({
      where: { patientId: id },
      order: { scheduledAt: 'DESC' },
    });
  }

  async prescriptions(id: string) {
    await this.getById(id);
    return this.prescriptionsRepository.find({
      where: { patientId: id },
      relations: { medications: true, doctor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async vitals(id: string) {
    await this.getById(id);
    return this.vitalsRepository.find({
      where: { patientId: id },
      relations: { consultation: true },
      order: { measuredAt: 'DESC' },
    });
  }
}
