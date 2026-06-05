import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEntry } from '../audit/audit-entry.entity';
import { Consultation } from '../consultations/consultation.entity';
import { toPaginated } from '../common/dto/pagination.dto';
import {
  AlertSeverity,
  PharmacyTarget,
  PrescriptionStatus,
  UserRole,
} from '../common/entities/enums';
import { DoctorsService } from '../doctors/doctors.service';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Patient } from '../patients/patient.entity';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { User } from '../users/user.entity';
import {
  CreatePrescriptionDto,
  MedicationLineDto,
  PrescriptionQueryDto,
  SendPrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescriptions.dto';
import { PrescriptionMedication } from './prescription-medication.entity';
import { PrescriptionPrintSnapshot } from './prescription-print-snapshot.entity';
import { Prescription } from './prescription.entity';
import { SafetyAlert } from './safety-alert.entity';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectRepository(Prescription)
    private readonly prescriptionsRepository: Repository<Prescription>,
    @InjectRepository(PrescriptionMedication)
    private readonly medicationsRepository: Repository<PrescriptionMedication>,
    @InjectRepository(PrescriptionPrintSnapshot)
    private readonly snapshotsRepository: Repository<PrescriptionPrintSnapshot>,
    @InjectRepository(SafetyAlert)
    private readonly alertsRepository: Repository<SafetyAlert>,
    @InjectRepository(PharmacyDispatch)
    private readonly dispatchesRepository: Repository<PharmacyDispatch>,
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    @InjectRepository(AuditEntry)
    private readonly auditRepository: Repository<AuditEntry>,
    private readonly doctorsService: DoctorsService,
    private readonly pharmacyService: PharmacyService,
  ) {}

  async findAll(query: PrescriptionQueryDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.prescriptionsRepository
      .createQueryBuilder('prescription')
      .leftJoinAndSelect('prescription.patient', 'patient')
      .leftJoinAndSelect('prescription.doctor', 'doctor')
      .leftJoinAndSelect('prescription.medications', 'medications');

    if (query.search) {
      qb.andWhere('LOWER(prescription.prescriptionNumber) LIKE :search', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    if (query.status) {
      qb.andWhere('prescription.status = :status', { status: query.status });
    }
    if (query.patientId) {
      qb.andWhere('prescription.patientId = :patientId', {
        patientId: query.patientId,
      });
    }
    if (user.role === UserRole.Doctor) {
      const doctor = await this.doctorsService.getByUserId(user.id);
      qb.andWhere('prescription.doctorId = :doctorId', { doctorId: doctor.id });
    } else if (query.doctorId) {
      qb.andWhere('prescription.doctorId = :doctorId', {
        doctorId: query.doctorId,
      });
    }

    const [data, total] = await qb
      .orderBy('prescription.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async getById(id: string) {
    const prescription = await this.prescriptionsRepository.findOne({
      where: { id },
      relations: {
        patient: true,
        doctor: true,
        consultation: true,
        medications: true,
        printSnapshot: true,
        safetyAlerts: true,
        pharmacyDispatches: true,
      },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    return prescription;
  }

  async create(dto: CreatePrescriptionDto, user: User) {
    const patient = await this.patientsRepository.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const doctorId = await this.resolveDoctorId(user, dto.consultationId);
    const prescription = await this.prescriptionsRepository.save(
      this.prescriptionsRepository.create({
        patientId: dto.patientId,
        consultationId: dto.consultationId,
        doctorId,
        diagnosis: dto.diagnosis,
        notes: dto.notes,
        status: PrescriptionStatus.Draft,
        prescriptionNumber: this.makePrescriptionNumber(),
      }),
    );

    if (dto.medications?.length) {
      await this.medicationsRepository.save(
        dto.medications.map((line, index) =>
          this.medicationsRepository.create({
            ...line,
            prescriptionId: prescription.id,
            sortOrder: line.sortOrder ?? index,
          }),
        ),
      );
    }

    return this.getById(prescription.id);
  }

  async update(id: string, dto: UpdatePrescriptionDto) {
    const prescription = await this.getById(id);
    const { medications, ...data } = dto;
    Object.assign(prescription, data);
    await this.prescriptionsRepository.save(prescription);
    if (medications) {
      await this.medicationsRepository.delete({ prescriptionId: id });
      await this.medicationsRepository.save(
        medications.map((line, index) =>
          this.medicationsRepository.create({
            ...line,
            prescriptionId: id,
            sortOrder: line.sortOrder ?? index,
          }),
        ),
      );
    }
    return this.getById(id);
  }

  async remove(id: string) {
    const prescription = await this.getById(id);
    await this.auditRepository.delete({ prescriptionId: id });
    await this.dispatchesRepository.delete({ prescriptionId: id });
    await this.snapshotsRepository.delete({ prescriptionId: id });
    await this.alertsRepository.delete({ prescriptionId: id });
    await this.medicationsRepository.delete({ prescriptionId: id });
    await this.prescriptionsRepository.remove(prescription);
    return { ok: true };
  }

  async addMedication(prescriptionId: string, dto: MedicationLineDto) {
    await this.getById(prescriptionId);
    const count = await this.medicationsRepository.count({
      where: { prescriptionId },
    });
    await this.medicationsRepository.save(
      this.medicationsRepository.create({
        ...dto,
        prescriptionId,
        sortOrder: dto.sortOrder ?? count,
      }),
    );
    return this.getById(prescriptionId);
  }

  async updateMedication(
    prescriptionId: string,
    medicationId: string,
    dto: MedicationLineDto,
  ) {
    await this.getById(prescriptionId);
    const medication = await this.medicationsRepository.findOne({
      where: { id: medicationId, prescriptionId },
    });
    if (!medication) {
      throw new NotFoundException('Medication line not found');
    }
    Object.assign(medication, dto);
    await this.medicationsRepository.save(medication);
    return this.getById(prescriptionId);
  }

  async removeMedication(prescriptionId: string, medicationId: string) {
    await this.getById(prescriptionId);
    const result = await this.medicationsRepository.delete({
      id: medicationId,
      prescriptionId,
    });
    if (!result.affected) {
      throw new NotFoundException('Medication line not found');
    }
    return this.getById(prescriptionId);
  }

  async validate(id: string, user: User) {
    const prescription = await this.getById(id);
    prescription.status = PrescriptionStatus.Validated;
    prescription.validatedAt = new Date();
    await this.prescriptionsRepository.save(prescription);
    await this.writeAudit(prescription, user, PrescriptionStatus.Validated);
    return this.getById(id);
  }

  async reject(id: string, user: User) {
    const prescription = await this.getById(id);
    prescription.status = PrescriptionStatus.Rejected;
    await this.prescriptionsRepository.save(prescription);
    await this.writeAudit(prescription, user, PrescriptionStatus.Rejected);
    return this.getById(id);
  }

  async createPrintSnapshot(id: string) {
    const prescription = await this.getById(id);
    const printedAt = new Date();
    const snapshot = {
      prescriptionId: prescription.id,
      doctorFirstName: prescription.doctor.firstName,
      doctorLastName: prescription.doctor.lastName,
      doctorSpecialty: prescription.doctor.specialty,
      doctorCnamCode: prescription.doctor.cnamCode,
      doctorFiscalNumber: prescription.doctor.fiscalNumber,
      doctorPhone: prescription.doctor.phone,
      patientFirstName: prescription.patient.firstName,
      patientLastName: prescription.patient.lastName,
      patientBirthDate: prescription.patient.birthDate,
      patientGender: prescription.patient.gender,
      footerNumber: prescription.prescriptionNumber,
      printedAt,
    };
    const existing = await this.snapshotsRepository.findOne({
      where: { prescriptionId: prescription.id },
    });
    await this.snapshotsRepository.save(
      existing ? Object.assign(existing, snapshot) : this.snapshotsRepository.create(snapshot),
    );
    await this.prescriptionsRepository.update(prescription.id, { printedAt });
    return this.getById(id);
  }

  async ordonnance(id: string) {
    const prescription = await this.getById(id);
    const snapshot = prescription.printSnapshot;
    return {
      prescriptionNumber: prescription.prescriptionNumber,
      patientId: prescription.patientId,
      status: prescription.status,
      diagnosis: prescription.diagnosis,
      notes: prescription.notes,
      printedAt: snapshot?.printedAt ?? prescription.printedAt,
      doctor: snapshot
        ? {
            firstName: snapshot.doctorFirstName,
            lastName: snapshot.doctorLastName,
            specialty: snapshot.doctorSpecialty,
            cnamCode: snapshot.doctorCnamCode,
            fiscalNumber: snapshot.doctorFiscalNumber,
            phone: snapshot.doctorPhone,
          }
        : prescription.doctor,
      patient: snapshot
        ? {
            id: prescription.patientId,
            firstName: snapshot.patientFirstName,
            lastName: snapshot.patientLastName,
            birthDate: snapshot.patientBirthDate,
            gender: snapshot.patientGender,
          }
        : prescription.patient,
      medications: prescription.medications.sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
      footerNumber: snapshot?.footerNumber ?? prescription.prescriptionNumber,
    };
  }

  async sendToPharmacy(id: string, dto: SendPrescriptionDto) {
    const prescription = await this.getById(id);
    return this.pharmacyService.createForPrescription(
      prescription,
      PharmacyTarget.Pharmacist,
      dto.recipient,
      dto.channel,
      dto.note,
    );
  }

  async sendToPatient(id: string, dto: SendPrescriptionDto) {
    const prescription = await this.getById(id);
    return this.pharmacyService.createForPrescription(
      prescription,
      PharmacyTarget.Patient,
      dto.recipient,
      dto.channel,
      dto.note,
    );
  }

  async safetyAlerts(id: string) {
    await this.getById(id);
    return this.alertsRepository.find({
      where: { prescriptionId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async safetyCheck(id: string) {
    const prescription = await this.getById(id);
    const alerts = prescription.medications.length > 8
      ? [
          this.alertsRepository.create({
            prescriptionId: id,
            severity: AlertSeverity.Moderate,
            title: 'Polypharmacy review',
            drugsInvolved: prescription.medications.map((m) => m.medicineName),
            explanation:
              'The prescription contains more than eight medication lines.',
            recommendedAction:
              'Review indication, duplication, and patient-specific risks.',
            evidence: 'Rule-based local safety check',
          }),
        ]
      : [];
    if (alerts.length) {
      await this.alertsRepository.save(alerts);
    }
    return this.safetyAlerts(id);
  }

  private async resolveDoctorId(user: User, consultationId?: string) {
    if (user.role === UserRole.Doctor) {
      return (await this.doctorsService.getByUserId(user.id)).id;
    }
    if (consultationId) {
      const consultation = await this.consultationsRepository.findOne({
        where: { id: consultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }
      return consultation.doctorId;
    }
    throw new BadRequestException(
      'Admin-created prescriptions require consultationId',
    );
  }

  private makePrescriptionNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RX-${date}-${random}`;
  }

  private async writeAudit(
    prescription: Prescription,
    user: User,
    finalStatus: string,
  ) {
    await this.auditRepository.save(
      this.auditRepository.create({
        prescriptionId: prescription.id,
        patientName: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
        doctorName: `${prescription.doctor.firstName} ${prescription.doctor.lastName}`,
        doctorModification: `Status changed by ${user.email}`,
        alertsOverridden: 0,
        finalStatus,
        timestamp: new Date(),
      }),
    );
  }
}
