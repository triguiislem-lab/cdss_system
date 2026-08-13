import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
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
import { reconcileValidatedPrescription } from '../patients/patient-medications';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { User } from '../users/user.entity';
import {
  CreatePrescriptionDto,
  MedicationLineDto,
  PrescriptionQueryDto,
  RecordPrescriptionSafetyActionDto,
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
    private readonly dataSource: DataSource,
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

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(new Brackets((where) => {
        where
          .where('LOWER(prescription.prescriptionNumber) LIKE :search', { search })
          .orWhere('LOWER(prescription.diagnosis) LIKE :search', { search })
          .orWhere('LOWER(patient.firstName) LIKE :search', { search })
          .orWhere('LOWER(patient.lastName) LIKE :search', { search })
          .orWhere('LOWER(medications.medicineName) LIKE :search', { search })
          .orWhere('LOWER(medications.dci) LIKE :search', { search });
      }));
    }
    if (query.reviewable) {
      qb.andWhere('prescription.status IN (:...reviewableStatuses)', {
        reviewableStatuses: [
          PrescriptionStatus.Draft,
          PrescriptionStatus.PendingReview,
        ],
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
    if (query.risk) {
      qb.andWhere('prescription.risk = :risk', { risk: query.risk });
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

  async getById(id: string, user?: User) {
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
    await this.assertPrescriptionAccess(prescription, user);
    return prescription;
  }

  async create(dto: CreatePrescriptionDto, user: User) {
    const doctorId = await this.resolveDoctorId(
      user,
      dto.consultationId,
      dto.patientId,
    );
    const patient = await this.patientsRepository.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    const prescriptionId = await this.dataSource.transaction(async (manager) => {
      const patientRepository = manager.getRepository(Patient);
      const transactionPatient = await patientRepository.findOne({
        where: { id: dto.patientId },
      });
      if (!transactionPatient) {
        throw new NotFoundException('Patient not found');
      }
      await this.attachPatientToDoctorIfNeeded(
        transactionPatient,
        user,
        doctorId,
        manager,
      );

      const prescriptionRepository = manager.getRepository(Prescription);
      const medicationRepository = manager.getRepository(PrescriptionMedication);
      const prescription = await prescriptionRepository.save(
        prescriptionRepository.create({
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
        await medicationRepository.save(
          dto.medications.map((line, index) =>
            medicationRepository.create({
              ...line,
              prescriptionId: prescription.id,
              sortOrder: line.sortOrder ?? index,
            }),
          ),
        );
      }
      await this.replaceSafetyAlerts(prescription.id, dto.safetyAlerts, manager);
      return prescription.id;
    });

    return this.getById(prescriptionId, user);
  }

  async update(id: string, dto: UpdatePrescriptionDto, user: User) {
    const prescription = await this.getById(id, user);
    if (
      prescription.status === PrescriptionStatus.Validated ||
      prescription.status === PrescriptionStatus.Rejected ||
      prescription.status === PrescriptionStatus.Cancelled
    ) {
      throw new BadRequestException('Only draft or pending-review prescriptions can be edited');
    }
    const nextPatientId = dto.patientId ?? prescription.patientId;
    const nextConsultationId = dto.consultationId ?? prescription.consultationId;
    await this.assertPrescriptionRelations(
      nextPatientId,
      nextConsultationId,
      prescription.doctorId,
    );
    const { medications, safetyAlerts, ...data } = dto;
    await this.dataSource.transaction(async (manager) => {
      const transactionPatient = await manager.getRepository(Patient).findOne({
        where: { id: nextPatientId },
      });
      if (!transactionPatient) {
        throw new NotFoundException('Patient not found');
      }
      if (nextPatientId !== prescription.patientId) {
        await this.attachPatientToDoctorIfNeeded(
          transactionPatient,
          user,
          prescription.doctorId,
          manager,
        );
      }

      const prescriptionRepository = manager.getRepository(Prescription);
      const medicationRepository = manager.getRepository(PrescriptionMedication);
      const transactionPrescription = await prescriptionRepository.findOne({
        where: { id },
      });
      if (!transactionPrescription) {
        throw new NotFoundException('Prescription not found');
      }
      Object.assign(transactionPrescription, data);
      transactionPrescription.patientId = nextPatientId;
      transactionPrescription.consultationId = nextConsultationId;
      await prescriptionRepository.save(transactionPrescription);
      if (medications !== undefined) {
        await medicationRepository.delete({ prescriptionId: id });
        await medicationRepository.save(
          medications.map((line, index) =>
            medicationRepository.create({
              ...line,
              prescriptionId: id,
              sortOrder: line.sortOrder ?? index,
            }),
          ),
        );
      }
      if (safetyAlerts !== undefined) {
        await this.replaceSafetyAlerts(id, safetyAlerts, manager);
      }
    });
    return this.getById(id, user);
  }

  async remove(id: string, user: User) {
    const prescription = await this.getById(id, user);
    if (prescription.status !== PrescriptionStatus.Draft) {
      throw new BadRequestException('Only draft prescriptions can be deleted');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AuditEntry).delete({ prescriptionId: id });
      await manager.getRepository(PharmacyDispatch).delete({ prescriptionId: id });
      await manager.getRepository(PrescriptionPrintSnapshot).delete({ prescriptionId: id });
      await manager.getRepository(SafetyAlert).delete({ prescriptionId: id });
      await manager.getRepository(PrescriptionMedication).delete({ prescriptionId: id });
      await manager.getRepository(Prescription).delete({ id });
    });
    return { ok: true };
  }

  async addMedication(prescriptionId: string, dto: MedicationLineDto, user: User) {
    const prescription = await this.getById(prescriptionId, user);
    this.assertEditable(prescription);
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
    return this.getById(prescriptionId, user);
  }

  async updateMedication(
    prescriptionId: string,
    medicationId: string,
    dto: MedicationLineDto,
    user: User,
  ) {
    const prescription = await this.getById(prescriptionId, user);
    this.assertEditable(prescription);
    const medication = await this.medicationsRepository.findOne({
      where: { id: medicationId, prescriptionId },
    });
    if (!medication) {
      throw new NotFoundException('Medication line not found');
    }
    Object.assign(medication, dto);
    await this.medicationsRepository.save(medication);
    return this.getById(prescriptionId, user);
  }

  async removeMedication(prescriptionId: string, medicationId: string, user: User) {
    const prescription = await this.getById(prescriptionId, user);
    this.assertEditable(prescription);
    const result = await this.medicationsRepository.delete({
      id: medicationId,
      prescriptionId,
    });
    if (!result.affected) {
      throw new NotFoundException('Medication line not found');
    }
    return this.getById(prescriptionId, user);
  }

  async validate(id: string, user: User) {
    const prescription = await this.getById(id, user);
    if (
      prescription.status !== PrescriptionStatus.Draft &&
      prescription.status !== PrescriptionStatus.PendingReview
    ) {
      throw new BadRequestException('Only draft or pending-review prescriptions can be validated');
    }
    const validatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      const transactionPrescription = await manager
        .getRepository(Prescription)
        .findOne({
          where: { id },
          relations: { patient: true, doctor: true, medications: true },
        });
      if (!transactionPrescription) {
        throw new NotFoundException('Prescription not found');
      }
      transactionPrescription.status = PrescriptionStatus.Validated;
      transactionPrescription.validatedAt = validatedAt;
      await manager.getRepository(Prescription).save(transactionPrescription);
      await this.reconcilePatientMedications(
        transactionPrescription,
        validatedAt,
        manager,
      );
      await this.writeAudit(
        transactionPrescription,
        user,
        PrescriptionStatus.Validated,
        {},
        manager,
      );
    });
    return this.getById(id, user);
  }

  async reject(id: string, user: User) {
    const prescription = await this.getById(id, user);
    if (
      prescription.status !== PrescriptionStatus.Draft &&
      prescription.status !== PrescriptionStatus.PendingReview
    ) {
      throw new BadRequestException('Only draft or pending-review prescriptions can be rejected');
    }
    prescription.status = PrescriptionStatus.Rejected;
    await this.prescriptionsRepository.save(prescription);
    await this.writeAudit(prescription, user, PrescriptionStatus.Rejected);
    return this.getById(id, user);
  }

  async cancel(id: string, user: User) {
    const prescription = await this.getById(id, user);
    if (prescription.status === PrescriptionStatus.Cancelled) {
      return prescription;
    }
    if (prescription.status === PrescriptionStatus.Validated) {
      throw new BadRequestException('Validated prescriptions cannot be cancelled');
    }
    prescription.status = PrescriptionStatus.Cancelled;
    await this.prescriptionsRepository.save(prescription);
    await this.writeAudit(prescription, user, PrescriptionStatus.Cancelled);
    return this.getById(id, user);
  }

  async createPrintSnapshot(id: string, user: User) {
    const prescription = await this.getById(id, user);
    if (prescription.status !== PrescriptionStatus.Validated) {
      throw new BadRequestException('Only validated prescriptions can be printed');
    }
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
    return this.getById(id, user);
  }

  async ordonnance(id: string, user: User) {
    const prescription = await this.getById(id, user);
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
            ...prescription.doctor,
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
            ...prescription.patient,
            id: prescription.patientId,
            firstName: snapshot.patientFirstName,
            lastName: snapshot.patientLastName,
            birthDate: snapshot.patientBirthDate,
            gender: snapshot.patientGender,
          }
        : prescription.patient,
      medications: prescription.medications.sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ).map((medication) => ({
        ...medication,
        dci: medication.dci,
      })),
      footerNumber: snapshot?.footerNumber ?? prescription.prescriptionNumber,
    };
  }

  async sendToPharmacy(id: string, dto: SendPrescriptionDto, user: User) {
    const prescription = await this.getById(id, user);
    if (prescription.status !== PrescriptionStatus.Validated) {
      throw new BadRequestException('Only validated prescriptions can be sent');
    }
    return this.pharmacyService.createForPrescription(
      prescription,
      PharmacyTarget.Pharmacist,
      dto.recipient,
      dto.channel,
      dto.note,
    );
  }

  async sendToPatient(id: string, dto: SendPrescriptionDto, user: User) {
    const prescription = await this.getById(id, user);
    if (prescription.status !== PrescriptionStatus.Validated) {
      throw new BadRequestException('Only validated prescriptions can be sent');
    }
    return this.pharmacyService.createForPrescription(
      prescription,
      PharmacyTarget.Patient,
      dto.recipient,
      dto.channel,
      dto.note,
    );
  }

  async safetyAlerts(id: string, user: User) {
    await this.getById(id, user);
    return this.alertsRepository.find({
      where: { prescriptionId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async recordSafetyAction(
    id: string,
    dto: RecordPrescriptionSafetyActionDto,
    user: User,
  ) {
    const prescription = await this.getById(id, user);
    const reason = dto.reason?.trim();
    if (dto.action === 'override' && (!reason || reason.length < 20)) {
      throw new BadRequestException(
        'An override requires a clinical reason of at least 20 characters',
      );
    }

    const labels: Record<RecordPrescriptionSafetyActionDto['action'], string> = {
      replace: 'Replace recommendation applied',
      adjust_dose: 'Dose adjustment recommendation applied',
      monitor: 'Monitoring recommendation recorded',
      override: 'Safety alert overridden by clinician',
    };
    const audit = await this.writeAudit(
      prescription,
      user,
      prescription.status,
      {
        recommendation: `${dto.alertTitle}: ${dto.recommendation ?? 'No recommendation provided'}`,
        doctorModification: labels[dto.action],
        alertsOverridden: dto.action === 'override' ? 1 : 0,
        overrideReason: reason,
      },
    );
    return { ok: true, action: dto.action, auditId: audit.id };
  }

  async safetyCheck(id: string, user: User) {
    const prescription = await this.getById(id, user);
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
    return this.safetyAlerts(id, user);
  }

  private async resolveDoctorId(
    user: User,
    consultationId?: string,
    patientId?: string,
  ) {
    const doctorId =
      user.role === UserRole.Doctor
        ? (await this.doctorsService.getByUserId(user.id)).id
        : undefined;

    if (consultationId) {
      const consultation = await this.consultationsRepository.findOne({
        where: { id: consultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }
      if (patientId && consultation.patientId !== patientId) {
        throw new BadRequestException(
          'The prescription patient must match the consultation patient',
        );
      }
      if (doctorId && consultation.doctorId !== doctorId) {
        throw new NotFoundException('Consultation not found');
      }
      return doctorId ?? consultation.doctorId;
    }

    if (doctorId) {
      return doctorId;
    }

    throw new BadRequestException(
      'Admin-created prescriptions require consultationId',
    );
  }

  private async assertPrescriptionRelations(
    patientId: string,
    consultationId: string | undefined,
    doctorId: string,
  ) {
    const patient = await this.patientsRepository.findOne({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (consultationId) {
      const consultation = await this.consultationsRepository.findOne({
        where: { id: consultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }
      if (consultation.patientId !== patientId) {
        throw new BadRequestException(
          'The prescription patient must match the consultation patient',
        );
      }
      if (consultation.doctorId !== doctorId) {
        throw new BadRequestException(
          'The prescription doctor must match the consultation doctor',
        );
      }
    }
  }

  private makePrescriptionNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RX-${date}-${random}`;
  }

  private async attachPatientToDoctorIfNeeded(
    patient: Patient,
    user: User | undefined,
    doctorId: string,
    manager?: EntityManager,
  ) {
    if (
      user?.role === UserRole.Doctor &&
      patient.ownerDoctorId &&
      patient.ownerDoctorId !== doctorId
    ) {
      throw new NotFoundException('Patient not found');
    }
    if (!patient.ownerDoctorId) {
      patient.ownerDoctorId = doctorId;
      await (manager?.getRepository(Patient) ?? this.patientsRepository).save(
        patient,
      );
    }
  }

  private async reconcilePatientMedications(
    prescription: Prescription,
    validatedAt: Date,
    manager?: EntityManager,
  ) {
    const patientsRepository =
      manager?.getRepository(Patient) ?? this.patientsRepository;
    const patient =
      prescription.patient ??
      (await patientsRepository.findOne({
        where: { id: prescription.patientId },
      }));
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    patient.currentMedications = reconcileValidatedPrescription(
      patient.currentMedications,
      prescription.id,
      (prescription.medications ?? []).map((medication) => ({
        ...medication,
        dci: medication.dci,
      })),
      validatedAt,
    );
    await patientsRepository.save(patient);
  }

  private async assertPrescriptionAccess(prescription: Prescription, user?: User) {
    if (!user || user.role !== UserRole.Doctor) {
      return;
    }
    const doctor = await this.doctorsService.getByUserId(user.id);
    if (prescription.doctorId !== doctor.id) {
      throw new NotFoundException('Prescription not found');
    }
  }

  private assertEditable(prescription: Prescription) {
    if (
      prescription.status !== PrescriptionStatus.Draft &&
      prescription.status !== PrescriptionStatus.PendingReview
    ) {
      throw new BadRequestException(
        'Only draft or pending-review prescriptions can be edited',
      );
    }
  }

  private async replaceSafetyAlerts(
    prescriptionId: string,
    alerts?: CreatePrescriptionDto['safetyAlerts'],
    manager?: EntityManager,
  ) {
    if (alerts === undefined) return;
    const alertsRepository =
      manager?.getRepository(SafetyAlert) ?? this.alertsRepository;
    await alertsRepository.delete({ prescriptionId });
    if (alerts.length === 0) return;
    await alertsRepository.save(
      alerts.map((alert) =>
        alertsRepository.create({
          ...alert,
          prescriptionId,
        }),
      ),
    );
  }

  private async writeAudit(
    prescription: Prescription,
    user: User,
    finalStatus: string,
    details: {
      recommendation?: string;
      doctorModification?: string;
      alertsOverridden?: number;
      overrideReason?: string;
    } = {},
    manager?: EntityManager,
  ) {
    const auditRepository =
      manager?.getRepository(AuditEntry) ?? this.auditRepository;
    return auditRepository.save(
      auditRepository.create({
        prescriptionId: prescription.id,
        patientName: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
        doctorName: `${prescription.doctor.firstName} ${prescription.doctor.lastName}`,
        recommendation: details.recommendation,
        doctorModification: details.doctorModification ?? `Status changed by ${user.email}`,
        alertsOverridden: details.alertsOverridden ?? 0,
        overrideReason: details.overrideReason,
        finalStatus,
        timestamp: new Date(),
      }),
    );
  }
}
