import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import {
  DispatchChannel,
  DispatchStatus,
  PharmacyTarget,
  PrescriptionStatus,
  UserRole,
} from '../common/entities/enums';
import { DoctorsService } from '../doctors/doctors.service';
import { EmailService } from '../email/email.service';
import { Prescription } from '../prescriptions/prescription.entity';
import { User } from '../users/user.entity';
import {
  CreatePharmacyDispatchDto,
  PharmacyDispatchQueryDto,
  UpdatePharmacyDispatchDto,
} from './dto/pharmacy.dto';
import { PharmacyDispatch } from './pharmacy-dispatch.entity';

@Injectable()
export class PharmacyService {
  constructor(
    @InjectRepository(PharmacyDispatch)
    private readonly dispatchesRepository: Repository<PharmacyDispatch>,
    @InjectRepository(Prescription)
    private readonly prescriptionsRepository: Repository<Prescription>,
    private readonly doctorsService: DoctorsService,
    private readonly emailService: EmailService,
  ) {}

  async findAll(query: PharmacyDispatchQueryDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.dispatchesRepository
      .createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.prescription', 'prescription')
      .leftJoinAndSelect('dispatch.patient', 'patient');

    if (user.role === UserRole.Doctor) {
      const doctor = await this.doctorsService.getByUserId(user.id);
      qb.andWhere('prescription.doctorId = :doctorId', {
        doctorId: doctor.id,
      });
    }

    if (query.search) {
      const search = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(dispatch.patientName) LIKE :search')
            .orWhere('LOWER(dispatch.recipient) LIKE :search')
            .orWhere('LOWER(prescription.prescriptionNumber) LIKE :search');
        }),
      ).setParameter('search', search);
    }
    if (query.status) {
      qb.andWhere('dispatch.status = :status', { status: query.status });
    }
    if (query.target) {
      qb.andWhere('dispatch.target = :target', { target: query.target });
    }

    const [data, total] = await qb
      .orderBy('dispatch.sentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string, user?: User) {
    const dispatch = await this.dispatchesRepository.findOne({
      where: { id },
      relations: { prescription: true, patient: true },
    });
    if (!dispatch) {
      throw new NotFoundException('Pharmacy dispatch not found');
    }
    await this.assertDispatchAccess(dispatch, user);
    return dispatch;
  }

  async create(dto: CreatePharmacyDispatchDto, user: User) {
    const prescription = await this.prescriptionsRepository.findOne({
      where: { id: dto.prescriptionId },
      relations: { patient: true },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    await this.assertPrescriptionAccess(prescription, user);
    this.assertValidatedPrescription(prescription);
    return this.createForPrescription(
      prescription,
      dto.target,
      dto.recipient,
      dto.channel,
      dto.note,
    );
  }

  async createForPrescription(
    prescription: Prescription,
    target: PharmacyTarget,
    recipient: string,
    channel: CreatePharmacyDispatchDto['channel'],
    note?: string,
  ) {
    this.assertValidatedPrescription(prescription);
    const dispatch = await this.dispatchesRepository.save(
      this.dispatchesRepository.create({
        prescriptionId: prescription.id,
        patientId: prescription.patientId,
        patientName: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
        target,
        recipient,
        channel,
        status: DispatchStatus.Sent,
        note,
        sentAt: new Date(),
      }),
    );
    if (channel === DispatchChannel.Email) {
      const emailPrescription = await this.prescriptionsRepository.findOne({
        where: { id: prescription.id },
        relations: { patient: true, doctor: true, medications: true },
      });
      if (emailPrescription) {
        void this.emailService.sendPrescriptionDispatchEmail({
          prescription: emailPrescription,
          target,
          recipient,
          channel,
          note,
        });
      }
    }
    return dispatch;
  }

  async update(id: string, dto: UpdatePharmacyDispatchDto, user: User) {
    const dispatch = await this.getById(id, user);
    Object.assign(dispatch, dto);
    return this.dispatchesRepository.save(dispatch);
  }

  async updateStatus(id: string, status: DispatchStatus, user: User) {
    const dispatch = await this.getById(id, user);
    dispatch.status = status;
    return this.dispatchesRepository.save(dispatch);
  }

  async remove(id: string, user: User) {
    const dispatch = await this.getById(id, user);
    await this.dispatchesRepository.remove(dispatch);
    return { ok: true };
  }

  private async assertDispatchAccess(dispatch: PharmacyDispatch, user?: User) {
    if (!user || user.role !== UserRole.Doctor) return;
    const doctor = await this.doctorsService.getByUserId(user.id);
    if (dispatch.prescription?.doctorId !== doctor.id) {
      throw new NotFoundException('Pharmacy dispatch not found');
    }
  }

  private async assertPrescriptionAccess(
    prescription: Prescription,
    user?: User,
  ) {
    if (!user || user.role !== UserRole.Doctor) return;
    const doctor = await this.doctorsService.getByUserId(user.id);
    if (prescription.doctorId !== doctor.id) {
      throw new NotFoundException('Prescription not found');
    }
  }

  private assertValidatedPrescription(prescription: Prescription) {
    if (prescription.status !== PrescriptionStatus.Validated) {
      throw new BadRequestException(
        'Only validated prescriptions can be transmitted',
      );
    }
  }
}
