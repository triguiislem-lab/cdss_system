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
