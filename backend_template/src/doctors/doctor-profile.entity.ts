import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorStatus } from '../common/entities/enums';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { User } from '../users/user.entity';

@Entity('doctor_profiles')
export class DoctorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.doctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ name: 'fiscal_number' })
  fiscalNumber: string;

  @Column({ nullable: true })
  specialty?: string;

  @Column({ name: 'cnam_code', nullable: true })
  cnamCode?: string;

  @Column({ nullable: true })
  gsm?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ type: 'simple-enum', enum: DoctorStatus, default: DoctorStatus.Active })
  status: DoctorStatus;

  @OneToMany(() => Consultation, (consultation) => consultation.doctor)
  consultations: Consultation[];

  @OneToMany(() => Prescription, (prescription) => prescription.doctor)
  prescriptions: Prescription[];

  @OneToMany(() => MedicineContribution, (contribution) => contribution.author)
  contributions: MedicineContribution[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
