import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Consultation } from './consultation.entity';

@Entity('consultation_vitals')
export class ConsultationVitals {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'consultation_id' })
  consultationId: string;

  @ManyToOne(() => Consultation, (consultation) => consultation.vitals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'consultation_id' })
  consultation: Consultation;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, (patient) => patient.vitals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'heart_rate', nullable: true })
  heartRate?: number;

  @Column({ name: 'blood_pressure', nullable: true })
  bloodPressure?: string;

  @Column({ type: 'decimal', nullable: true })
  temperature?: number;

  @Column({ name: 'height_cm', type: 'decimal', nullable: true })
  heightCm?: number;

  @Column({ name: 'weight_kg', type: 'decimal', nullable: true })
  weightKg?: number;

  @Column({ name: 'max_weight_kg', type: 'decimal', nullable: true })
  maxWeightKg?: number;

  @Column({ name: 'last_period_date', type: 'date', nullable: true })
  lastPeriodDate?: Date;

  @Column({ nullable: true })
  gad?: string;

  @Column({ name: 'oxygen_saturation', type: 'decimal', nullable: true })
  oxygenSaturation?: number;

  @Column({ name: 'respiratory_rate', nullable: true })
  respiratoryRate?: number;

  @Column({ name: 'measured_at', type: 'datetime' })
  measuredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
