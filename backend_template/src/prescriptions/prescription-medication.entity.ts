import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicationStatus } from '../common/entities/enums';
import { Medicine } from '../medicines/medicine.entity';
import { Prescription } from './prescription.entity';

@Entity('prescription_medications')
export class PrescriptionMedication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id' })
  prescriptionId: string;

  @ManyToOne(() => Prescription, (prescription) => prescription.medications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  @Column({ name: 'medicine_id', nullable: true })
  medicineId?: string;

  @ManyToOne(() => Medicine, (medicine) => medicine.prescriptionMedications, {
    nullable: true,
  })
  @JoinColumn({ name: 'medicine_id' })
  medicine?: Medicine;

  @Column({ name: 'medicine_name' })
  medicineName: string;

  @Column()
  dosage: string;

  @Column({ nullable: true })
  route?: string;

  @Column()
  frequency: string;

  @Column({ nullable: true })
  duration?: string;

  @Column({ type: 'text', nullable: true })
  indication?: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ nullable: true })
  confidence?: number;

  @Column({ type: 'simple-enum', enum: MedicationStatus, nullable: true })
  status?: MedicationStatus;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;
}
