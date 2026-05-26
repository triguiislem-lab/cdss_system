import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Prescription } from './prescription.entity';

@Entity('prescription_print_snapshots')
export class PrescriptionPrintSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id', unique: true })
  prescriptionId: string;

  @OneToOne(() => Prescription, (prescription) => prescription.printSnapshot, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  @Column({ name: 'doctor_first_name' })
  doctorFirstName: string;

  @Column({ name: 'doctor_last_name' })
  doctorLastName: string;

  @Column({ name: 'doctor_specialty', nullable: true })
  doctorSpecialty?: string;

  @Column({ name: 'doctor_cnam_code', nullable: true })
  doctorCnamCode?: string;

  @Column({ name: 'doctor_fiscal_number', nullable: true })
  doctorFiscalNumber?: string;

  @Column({ name: 'doctor_phone', nullable: true })
  doctorPhone?: string;

  @Column({ name: 'patient_first_name' })
  patientFirstName: string;

  @Column({ name: 'patient_last_name' })
  patientLastName: string;

  @Column({ name: 'patient_birth_date', type: 'date', nullable: true })
  patientBirthDate?: Date;

  @Column({ name: 'patient_gender', nullable: true })
  patientGender?: string;

  @Column({ name: 'footer_number', nullable: true })
  footerNumber?: string;

  @Column({ name: 'printed_at', type: 'datetime' })
  printedAt: Date;
}
