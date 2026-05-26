import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { AlertSeverity, PrescriptionStatus, RiskLevel } from '../common/entities/enums';
import { Patient } from '../patients/patient.entity';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { AuditEntry } from '../audit/audit-entry.entity';
import { PrescriptionMedication } from './prescription-medication.entity';
import { PrescriptionPrintSnapshot } from './prescription-print-snapshot.entity';
import { SafetyAlert } from './safety-alert.entity';

@Entity('prescriptions')
export class Prescription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_number', unique: true })
  prescriptionNumber: string;

  @Column({ name: 'consultation_id', nullable: true })
  consultationId?: string;

  @ManyToOne(() => Consultation, (consultation) => consultation.prescriptions, {
    nullable: true,
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation?: Consultation;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, (patient) => patient.prescriptions)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @ManyToOne(() => DoctorProfile, (doctor) => doctor.prescriptions)
  @JoinColumn({ name: 'doctor_id' })
  doctor: DoctorProfile;

  @Column({ type: 'text', nullable: true })
  diagnosis?: string;

  @Column({
    type: 'simple-enum',
    enum: PrescriptionStatus,
    default: PrescriptionStatus.Draft,
  })
  status: PrescriptionStatus;

  @Column({ type: 'simple-enum', enum: RiskLevel, nullable: true })
  risk?: RiskLevel;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'ai_trace_id', nullable: true })
  aiTraceId?: string;

  @Column({ name: 'ai_status', nullable: true })
  aiStatus?: string;

  @Column({ name: 'ai_blocked', default: false })
  aiBlocked: boolean;

  @Column({ name: 'ai_review_required', default: false })
  aiReviewRequired: boolean;

  @Column({ name: 'ai_payload', type: 'simple-json', nullable: true })
  aiPayload?: unknown;

  @Column({ name: 'validated_at', type: 'datetime', nullable: true })
  validatedAt?: Date;

  @Column({ name: 'printed_at', type: 'datetime', nullable: true })
  printedAt?: Date;

  @OneToMany(() => PrescriptionMedication, (medication) => medication.prescription, {
    cascade: true,
  })
  medications: PrescriptionMedication[];

  @OneToOne(() => PrescriptionPrintSnapshot, (snapshot) => snapshot.prescription, {
    cascade: true,
  })
  printSnapshot?: PrescriptionPrintSnapshot;

  @OneToMany(() => SafetyAlert, (alert) => alert.prescription, { cascade: true })
  safetyAlerts: SafetyAlert[];

  @OneToMany(() => AuditEntry, (entry) => entry.prescription)
  auditEntries: AuditEntry[];

  @OneToMany(() => PharmacyDispatch, (dispatch) => dispatch.prescription)
  pharmacyDispatches: PharmacyDispatch[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export { AlertSeverity };
