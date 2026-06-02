import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
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
        'LOWER(audit.patientName) LIKE :search OR LOWER(audit.doctorName) LIKE :search',
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
    const [data, total] = await qb
      .orderBy('audit.timestamp', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
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
