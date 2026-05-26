import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { Patient } from '../patients/patient.entity';
import { ConsultationStatus } from '../common/entities/enums';
import { Prescription } from '../prescriptions/prescription.entity';
import { ConsultationVitals } from './consultation-vitals.entity';

@Entity('consultations')
export class Consultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, (patient) => patient.consultations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @ManyToOne(() => DoctorProfile, (doctor) => doctor.consultations)
  @JoinColumn({ name: 'doctor_id' })
  doctor: DoctorProfile;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'scheduled_at', type: 'datetime' })
  scheduledAt: Date;

  @Column({
    type: 'simple-enum',
    enum: ConsultationStatus,
    default: ConsultationStatus.Scheduled,
  })
  status: ConsultationStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  diagnosis?: string;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt?: Date;

  @Column({ name: 'recording_url', type: 'text', nullable: true })
  recordingUrl?: string;

  @Column({ name: 'recording_duration_sec', nullable: true })
  recordingDurationSec?: number;

  @OneToMany(() => ConsultationVitals, (vitals) => vitals.consultation)
  vitals: ConsultationVitals[];

  @OneToMany(() => Prescription, (prescription) => prescription.consultation)
  prescriptions: Prescription[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
