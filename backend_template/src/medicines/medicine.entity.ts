import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PregnancyStatus,
  ReimbursementRate,
} from '../common/entities/enums';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { PrescriptionMedication } from '../prescriptions/prescription-medication.entity';

@Entity('medicines')
export class Medicine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  dci: string;

  @Column({ type: 'simple-json' })
  brands: string[];

  @Column({ name: 'atc_code' })
  atcCode: string;

  @Column({ name: 'drug_class' })
  drugClass: string;

  @Column({ type: 'simple-json' })
  forms: string[];

  @Column({ type: 'simple-json' })
  laboratories: string[];

  @Column({ type: 'simple-enum', enum: ReimbursementRate })
  reimbursement: ReimbursementRate;

  @Column({ type: 'text' })
  indication: string;

  @Column({ type: 'simple-json' })
  contraindications: string[];

  @Column({ name: 'posology_adult', type: 'text' })
  posologyAdult: string;

  @Column({ type: 'simple-enum', enum: PregnancyStatus })
  pregnancy: PregnancyStatus;

  @Column({ name: 'renal_adjust', default: false })
  renalAdjust: boolean;

  @Column({ name: 'hepatic_adjust', default: false })
  hepaticAdjust: boolean;

  @Column({ name: 'price_tnd_approx', type: 'decimal', nullable: true })
  priceTndApprox?: number;

  @OneToMany(() => MedicineContribution, (contribution) => contribution.targetMedicine)
  contributions: MedicineContribution[];

  @OneToMany(() => PrescriptionMedication, (medication) => medication.medicine)
  prescriptionMedications: PrescriptionMedication[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
