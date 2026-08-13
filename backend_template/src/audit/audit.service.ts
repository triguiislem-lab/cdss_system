import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import { PrescriptionStatus } from '../common/entities/enums';
import { AuditEntry } from './audit-entry.entity';
import { AuditQueryDto } from './dto/audit.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEntry)
    private readonly auditRepository: Repository<AuditEntry>,
  ) {}

  async findAll(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.auditRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.prescription', 'prescription');
    if (query.status) {
      qb.andWhere('audit.finalStatus = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('audit.timestamp >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('audit.timestamp <= :to', { to: query.to });
    }
    if (query.search) {
      qb.andWhere(
        `LOWER(COALESCE(audit.patientName, '')) LIKE :search
         OR LOWER(COALESCE(audit.doctorName, '')) LIKE :search
         OR LOWER(COALESCE(prescription.prescriptionNumber, '')) LIKE :search
         OR LOWER(COALESCE(audit.modelVersion, '')) LIKE :search
         OR LOWER(COALESCE(audit.recommendation, '')) LIKE :search
         OR LOWER(COALESCE(audit.doctorModification, '')) LIKE :search
         OR LOWER(COALESCE(audit.finalStatus, '')) LIKE :search`,
        { search: `%${query.search.toLowerCase()}%` },
      );
    }
    if (query.doctorId) {
      qb.andWhere('prescription.doctorId = :doctorId', {
        doctorId: query.doctorId,
      });
    }
    if (query.patientId) {
      qb.andWhere('prescription.patientId = :patientId', {
        patientId: query.patientId,
      });
    }
    const [entries, total] = await qb
      .orderBy('audit.timestamp', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const data = entries.map((entry) => ({
      ...entry,
      prescriptionNumber: entry.prescription?.prescriptionNumber ?? null,
    }));
    return toPaginated(data, total, page, limit);
  }

  async summary() {
    const [total, drafts, pendingReview, validated, rejected, cancelled, overridden, latest] = await Promise.all([
      this.auditRepository.count(),
      this.auditRepository.count({ where: { finalStatus: PrescriptionStatus.Draft } }),
      this.auditRepository.count({ where: { finalStatus: PrescriptionStatus.PendingReview } }),
      this.auditRepository.count({ where: { finalStatus: PrescriptionStatus.Validated } }),
      this.auditRepository.count({ where: { finalStatus: PrescriptionStatus.Rejected } }),
      this.auditRepository.count({ where: { finalStatus: PrescriptionStatus.Cancelled } }),
      this.auditRepository
        .createQueryBuilder('audit')
        .where('audit.alertsOverridden > 0')
        .getCount(),
      this.auditRepository
        .find({ order: { timestamp: 'DESC' }, take: 1 })
        .then((entries) => entries[0]),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      source: 'PostgreSQL audit_entries via NestJS',
      total,
      drafts,
      pendingReview,
      validated,
      rejected,
      cancelled,
      overridden,
      latestAt: latest?.timestamp?.toISOString() ?? null,
    };
  }

  async getById(id: string) {
    const entry = await this.auditRepository.findOne({
      where: { id },
      relations: { prescription: true },
    });
    if (!entry) {
      throw new NotFoundException('Audit entry not found');
    }
    return entry;
  }

  prescriptionEntries(prescriptionId: string) {
    return this.auditRepository.find({
      where: { prescriptionId },
      order: { timestamp: 'DESC' },
    });
  }
}
