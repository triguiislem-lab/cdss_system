import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AlertSeverity } from '../common/entities/enums';

@Entity('interaction_results')
export class InteractionResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'drug_a' })
  drugA: string;

  @Column({ name: 'drug_b' })
  drugB: string;

  @Column({ type: 'simple-enum', enum: AlertSeverity })
  severity: AlertSeverity;

  @Column({ type: 'text' })
  mechanism: string;

  @Column({ type: 'text' })
  consequence: string;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text' })
  evidence: string;
}
