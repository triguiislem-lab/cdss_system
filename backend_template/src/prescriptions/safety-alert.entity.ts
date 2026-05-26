import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlertSeverity } from '../common/entities/enums';
import { Prescription } from './prescription.entity';

@Entity('safety_alerts')
export class SafetyAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id', nullable: true })
  prescriptionId?: string;

  @ManyToOne(() => Prescription, (prescription) => prescription.safetyAlerts, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'prescription_id' })
  prescription?: Prescription;

  @Column({ type: 'simple-enum', enum: AlertSeverity })
  severity: AlertSeverity;

  @Column()
  title: string;

  @Column({ name: 'drugs_involved', type: 'simple-json' })
  drugsInvolved: string[];

  @Column({ type: 'text' })
  explanation: string;

  @Column({ name: 'recommended_action', type: 'text' })
  recommendedAction: string;

  @Column({ type: 'text', nullable: true })
  alternative?: string;

  @Column({ type: 'text' })
  evidence: string;

  @Column({ name: 'evidence_url', type: 'text', nullable: true })
  evidenceUrl?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
