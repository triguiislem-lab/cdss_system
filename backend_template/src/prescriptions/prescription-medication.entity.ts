import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicationStatus } from '../common/entities/enums';
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

  /**
   * Catalogue identifier. It may reference Firebase Data Connect or the
   * legacy local catalogue, so it must not be a FK to the local medicines table.
   */
  @Column({ name: 'medicine_id', nullable: true })
  medicineId?: string;

  @Column({ name: 'medicine_dci', nullable: true })
  dci?: string;

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
