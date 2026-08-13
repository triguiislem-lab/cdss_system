import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { toPaginated } from '../common/dto/pagination.dto';
import { Gender, UserRole } from '../common/entities/enums';
import { DoctorsService } from '../doctors/doctors.service';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { User } from '../users/user.entity';
import { buildPatientFlags } from './patient-flags';
import { pruneExpiredPatientMedications } from './patient-medications';
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
    @InjectRepository(PharmacyDispatch)
    private readonly dispatchesRepository: Repository<PharmacyDispatch>,
    private readonly doctorsService: DoctorsService,
  ) {}

  async findAll(query: PatientQueryDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const doctorId = await this.resolveDoctorId(user);
    const qb = this.patientsRepository
      .createQueryBuilder('patient')
      .leftJoin('patient.consultations', 'consultation')
      .leftJoin('patient.prescriptions', 'prescription')
      .distinct(true);

    this.scopePatientsToDoctor(qb, doctorId);

    if (query.search) {
      const search = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(patient.firstName) LIKE :search')
            .orWhere('LOWER(patient.lastName) LIKE :search')
            .orWhere('LOWER(patient.phone1) LIKE :search')
            .orWhere('LOWER(patient.internalCode) LIKE :search');
        }),
      ).setParameter('search', search);
    }
    if (query.gender) {
      qb.andWhere('patient.gender = :gender', { gender: query.gender });
    }

    const [data, total] = await qb
      .orderBy('patient.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const presented = await Promise.all(
      data.map((patient) => this.presentPatient(patient)),
    );
    return toPaginated(presented, total, page, limit);
  }

  async getById(id: string, user?: User) {
    const patient = await this.findPatientEntity(id, user);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return this.presentPatient(patient);
  }

  private async findPatientEntity(id: string, user?: User) {
    const doctorId = await this.resolveDoctorId(user);
    const qb = this.patientsRepository
      .createQueryBuilder('patient')
      .where('patient.id = :id', { id });

    if (doctorId) {
      qb.leftJoin('patient.consultations', 'consultation')
        .leftJoin('patient.prescriptions', 'prescription');
      this.scopePatientsToDoctor(qb, doctorId);
    }

    return qb.getOne();
  }

  async create(dto: CreatePatientDto, user: User) {
    const ownerDoctorId = await this.resolveOwnerDoctorId(dto, user);
    const patient = this.patientsRepository.create({
      ...dto,
      ownerDoctorId,
    });
    this.normalizePregnancyData(patient);
    const savedPatient = await this.patientsRepository.save(patient);
    return this.presentPatient(savedPatient);
  }

  async update(id: string, dto: UpdatePatientDto, user: User) {
    const patient = await this.findPatientEntity(id, user);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    const { ownerDoctorId, ...data } = dto;
    Object.assign(patient, data);
    if (user.role === UserRole.Admin && ownerDoctorId !== undefined) {
      if (ownerDoctorId) {
        await this.doctorsService.getById(ownerDoctorId);
      }
      patient.ownerDoctorId = ownerDoctorId;
    }
    this.normalizePregnancyData(patient);
    const savedPatient = await this.patientsRepository.save(patient);
    return this.presentPatient(savedPatient);
  }

  async remove(id: string, user: User) {
    const patient = await this.findPatientEntity(id, user);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    const [prescriptionCount, dispatchCount] = await Promise.all([
      this.prescriptionsRepository.count({ where: { patientId: id } }),
      this.dispatchesRepository.count({ where: { patientId: id } }),
    ]);
    if (prescriptionCount || dispatchCount) {
      throw new ConflictException(
        'Ce patient ne peut pas être supprimé car son dossier contient des prescriptions ou des transmissions. Utilisez l’archivage.',
      );
    }
    await this.patientsRepository.remove(patient);
    return { ok: true };
  }

  async consultations(id: string, user: User) {
    const doctorId = await this.resolveDoctorId(user);
    await this.getById(id, user);
    return this.consultationsRepository.find({
      where: { patientId: id, ...(doctorId ? { doctorId } : {}) },
      order: { scheduledAt: 'DESC' },
    });
  }

  async prescriptions(id: string, user: User) {
    const doctorId = await this.resolveDoctorId(user);
    await this.getById(id, user);
    return this.prescriptionsRepository.find({
      where: { patientId: id, ...(doctorId ? { doctorId } : {}) },
      relations: { medications: true, doctor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async vitals(id: string, user: User) {
    const doctorId = await this.resolveDoctorId(user);
    await this.getById(id, user);
    const qb = this.vitalsRepository
      .createQueryBuilder('vitals')
      .leftJoinAndSelect('vitals.consultation', 'consultation')
      .where('vitals.patientId = :id', { id })
      .orderBy('vitals.measuredAt', 'DESC');

    if (doctorId) {
      qb.andWhere('consultation.doctorId = :doctorId', { doctorId });
    }

    return qb.getMany();
  }

  private async resolveDoctorId(user?: User) {
    if (!user || user.role === UserRole.Admin) {
      return undefined;
    }
    return (await this.doctorsService.getByUserId(user.id)).id;
  }

  private async presentPatient(patient: Patient) {
    const { medications, changed } = pruneExpiredPatientMedications(
      patient.currentMedications,
    );
    if (changed) {
      patient.currentMedications = medications;
      await this.patientsRepository.save(patient);
    }
    return {
      ...patient,
      ...buildPatientFlags(patient),
    };
  }

  private normalizePregnancyData(patient: Patient) {
    if (patient.gender !== Gender.Female) {
      patient.pregnancyStatus = null;
      patient.pregnancyTrimester = null;
      return;
    }
    if (patient.pregnancyStatus !== 'pregnant') {
      patient.pregnancyTrimester = null;
    }
  }

  private async resolveOwnerDoctorId(dto: CreatePatientDto, user: User) {
    if (user.role === UserRole.Doctor) {
      return (await this.doctorsService.getByUserId(user.id)).id;
    }

    if (!dto.ownerDoctorId) {
      return undefined;
    }

    await this.doctorsService.getById(dto.ownerDoctorId);
    return dto.ownerDoctorId;
  }

  private scopePatientsToDoctor(
    qb: SelectQueryBuilder<Patient>,
    doctorId?: string,
  ) {
    if (!doctorId) {
      return;
    }

    qb.andWhere(
      new Brackets((where) => {
        where
          .where('patient.ownerDoctorId = :doctorId')
          .orWhere('consultation.doctorId = :doctorId')
          .orWhere('prescription.doctorId = :doctorId');
      }),
    ).setParameter('doctorId', doctorId);
  }
}
