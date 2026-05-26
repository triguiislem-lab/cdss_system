import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Prescription } from '../prescriptions/prescription.entity';

@Entity('audit_entries')
export class AuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id' })
  prescriptionId: string;

  @ManyToOne(() => Prescription, (prescription) => prescription.auditEntries)
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  @Column({ name: 'patient_name' })
  patientName: string;

  @Column({ name: 'doctor_name' })
  doctorName: string;

  @Column({ name: 'model_version', nullable: true })
  modelVersion?: string;

  @Column({ type: 'text', nullable: true })
  recommendation?: string;

  @Column({ name: 'doctor_modification', type: 'text', nullable: true })
  doctorModification?: string;

  @Column({ name: 'alerts_overridden', default: 0 })
  alertsOverridden: number;

  @Column({ name: 'override_reason', type: 'text', nullable: true })
  overrideReason?: string;

  @Column({ name: 'final_status' })
  finalStatus: string;

  @Column()
  timestamp: Date;
}
