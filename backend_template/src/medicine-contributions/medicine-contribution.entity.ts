import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ContributionKind,
  ContributionStatus,
} from '../common/entities/enums';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { Medicine } from '../medicines/medicine.entity';
import { User } from '../users/user.entity';

@Entity('medicine_contributions')
export class MedicineContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'simple-enum', enum: ContributionKind })
  kind: ContributionKind;

  @Column({
    type: 'simple-enum',
    enum: ContributionStatus,
    default: ContributionStatus.Pending,
  })
  status: ContributionStatus;

  @Column({ name: 'author_doctor_id' })
  authorDoctorId: string;

  @ManyToOne(() => DoctorProfile, (doctor) => doctor.contributions)
  @JoinColumn({ name: 'author_doctor_id' })
  author: DoctorProfile;

  @Column({ name: 'author_email' })
  authorEmail: string;

  @Column({ name: 'author_name' })
  authorName: string;

  @Column({ name: 'target_medicine_id', nullable: true })
  targetMedicineId?: string;

  @ManyToOne(() => Medicine, (medicine) => medicine.contributions, {
    nullable: true,
  })
  @JoinColumn({ name: 'target_medicine_id' })
  targetMedicine?: Medicine;

  @Column({ name: 'target_medicine_dci', nullable: true })
  targetMedicineDci?: string;

  @Column({ nullable: true })
  field?: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue?: string;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'new_medicine', type: 'simple-json', nullable: true })
  newMedicine?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  rationale?: string;

  @Column({ name: 'reviewer_admin_id', nullable: true })
  reviewerAdminId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewer_admin_id' })
  reviewerAdmin?: User;

  @Column({ name: 'reviewer_email', nullable: true })
  reviewerEmail?: string;

  @Column({ name: 'reviewer_name', nullable: true })
  reviewerName?: string;

  @Column({ name: 'reviewed_at', nullable: true })
  reviewedAt?: Date;

  @Column({ name: 'refusal_reason', type: 'text', nullable: true })
  refusalReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
