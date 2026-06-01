import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { Gender } from '../common/entities/enums';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Prescription } from '../prescriptions/prescription.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'birth_date', type: 'date' })
  birthDate: Date;

  @Column({ type: 'simple-enum', enum: Gender })
  gender: Gender;

  @Column()
  phone1: string;

  @Column({ nullable: true })
  phone2?: string;

  @Column({ nullable: true })
  phone3?: string;

  @Column({ nullable: true })
  profession?: string;

  @Column({ name: 'internal_code', unique: true, nullable: true })
  internalCode?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'weight_kg', type: 'decimal', nullable: true })
  weightKg?: number;

  @Column({ name: 'height_cm', type: 'decimal', nullable: true })
  heightCm?: number;

  @Column({ type: 'simple-json', nullable: true })
  allergies?: string[];

  @Column({ name: 'current_medications', type: 'simple-json', nullable: true })
  currentMedications?: Array<{ name: string; dose?: string }>;

  @Column({ type: 'simple-json', nullable: true })
  comorbidities?: string[];

  @Column({ type: 'simple-json', nullable: true })
  renal?: { gfr?: number; status?: string };

  @Column({ type: 'simple-json', nullable: true })
  liver?: { status?: string; note?: string };

  @Column({ name: 'vitals_snapshot', type: 'simple-json', nullable: true })
  vitalsSnapshot?: {
    hr?: number;
    bp?: string;
    temp?: number;
    spo2?: number;
  };

  @Column({ type: 'simple-json', nullable: true })
  flags?: string[];

  @Column({ name: 'missing_data', type: 'simple-json', nullable: true })
  missingData?: string[];

  @OneToMany(() => Consultation, (consultation) => consultation.patient)
  consultations: Consultation[];

  @OneToMany(() => ConsultationVitals, (vitals) => vitals.patient)
  vitals: ConsultationVitals[];

  @OneToMany(() => Prescription, (prescription) => prescription.patient)
  prescriptions: Prescription[];

  @OneToMany(() => PharmacyDispatch, (dispatch) => dispatch.patient)
  pharmacyDispatches: PharmacyDispatch[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
