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

  @Column({ name: 'source_medicine_id', nullable: true })
  sourceMedicineId?: string;

  @Column({ name: 'source_key', nullable: true })
  sourceKey?: string;

  @Column({ name: 'local_product_name', nullable: true })
  localProductName?: string;

  @Column()
  dci: string;

  @Column({ type: 'simple-json' })
  brands: string[];

  @Column({ name: 'atc_code', default: '' })
  atcCode: string;

  @Column({ name: 'drug_class' })
  drugClass: string;

  @Column({ name: 'therapeutic_subclass', nullable: true })
  therapeuticSubclass?: string;

  @Column({ type: 'simple-json' })
  forms: string[];

  @Column({ type: 'simple-json' })
  laboratories: string[];

  @Column({ nullable: true })
  dosage?: string;

  @Column({ nullable: true })
  form?: string;

  @Column({ nullable: true })
  presentation?: string;

  @Column({ nullable: true })
  amm?: string;

  @Column({ name: 'amm_date', nullable: true })
  ammDate?: string;

  @Column({ name: 'generic_status', nullable: true })
  genericStatus?: string;

  @Column({ name: 'tableau', nullable: true })
  tableau?: string;

  @Column({ name: 'veic_status', nullable: true })
  veicStatus?: string;

  @Column({ name: 'conservation_duration_months', nullable: true })
  conservationDurationMonths?: string;

  @Column({ name: 'primary_packaging', nullable: true })
  primaryPackaging?: string;

  @Column({ name: 'packaging_specification', nullable: true })
  packagingSpecification?: string;

  @Column({ type: 'simple-enum', enum: ReimbursementRate })
  reimbursement: ReimbursementRate;

  @Column({ name: 'reimbursement_category', nullable: true })
  reimbursementCategory?: string;

  @Column({
    name: 'reimbursement_rate_percent',
    type: 'decimal',
    nullable: true,
  })
  reimbursementRatePercent?: number;

  @Column({ name: 'reference_tariff_tnd', type: 'decimal', nullable: true })
  referenceTariffTnd?: number;

  @Column({ name: 'public_price_min_tnd', type: 'decimal', nullable: true })
  publicPriceMinTnd?: number;

  @Column({ name: 'public_price_max_tnd', type: 'decimal', nullable: true })
  publicPriceMaxTnd?: number;

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

  @Column({ name: 'detail_url', type: 'text', nullable: true })
  detailUrl?: string;

  @Column({ name: 'rcp_url', type: 'text', nullable: true })
  rcpUrl?: string;

  @Column({ name: 'notice_url', type: 'text', nullable: true })
  noticeUrl?: string;

  @Column({ name: 'source_reference', type: 'text', nullable: true })
  sourceReference?: string;

  @Column({ name: 'source_systems', type: 'simple-json', nullable: true })
  sourceSystems?: string[];

  @OneToMany(() => MedicineContribution, (contribution) => contribution.targetMedicine)
  contributions: MedicineContribution[];

  @OneToMany(() => PrescriptionMedication, (medication) => medication.medicine)
  prescriptionMedications: PrescriptionMedication[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
