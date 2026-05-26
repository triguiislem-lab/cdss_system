import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  DispatchChannel,
  DispatchStatus,
  PharmacyTarget,
} from '../common/entities/enums';
import { Patient } from '../patients/patient.entity';
import { Prescription } from '../prescriptions/prescription.entity';

@Entity('pharmacy_dispatches')
export class PharmacyDispatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id' })
  prescriptionId: string;

  @ManyToOne(() => Prescription, (prescription) => prescription.pharmacyDispatches)
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, (patient) => patient.pharmacyDispatches)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'patient_name' })
  patientName: string;

  @Column({ type: 'simple-enum', enum: PharmacyTarget })
  target: PharmacyTarget;

  @Column()
  recipient: string;

  @Column({ type: 'simple-enum', enum: DispatchChannel })
  channel: DispatchChannel;

  @Column({
    type: 'simple-enum',
    enum: DispatchStatus,
    default: DispatchStatus.Sent,
  })
  status: DispatchStatus;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'sent_at', type: 'datetime' })
  sentAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
