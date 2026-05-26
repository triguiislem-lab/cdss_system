import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import {
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './dto/medicines.dto';
import { Medicine } from './medicine.entity';

@Injectable()
export class MedicinesService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
  ) {}

  async findAll(query: MedicineQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.medicinesRepository.createQueryBuilder('medicine');

    if (query.search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('medicine.dci ILIKE :search')
            .orWhere('medicine.drugClass ILIKE :search')
            .orWhere('medicine.brands::text ILIKE :search');
        }),
      ).setParameter('search', `%${query.search}%`);
    }
    if (query.drugClass) {
      qb.andWhere('medicine.drugClass = :drugClass', {
        drugClass: query.drugClass,
      });
    }
    if (query.pregnancy) {
      qb.andWhere('medicine.pregnancy = :pregnancy', {
        pregnancy: query.pregnancy,
      });
    }
    if (query.renalAdjust !== undefined) {
      qb.andWhere('medicine.renalAdjust = :renalAdjust', {
        renalAdjust: query.renalAdjust === 'true',
      });
    }
    if (query.hepaticAdjust !== undefined) {
      qb.andWhere('medicine.hepaticAdjust = :hepaticAdjust', {
        hepaticAdjust: query.hepaticAdjust === 'true',
      });
    }

    const [data, total] = await qb
      .orderBy('medicine.dci', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async search(q?: string) {
    if (!q) {
      return [];
    }
    return this.medicinesRepository
      .createQueryBuilder('medicine')
      .where('medicine.dci ILIKE :q', { q: `%${q}%` })
      .orWhere('medicine.brands::text ILIKE :q', { q: `%${q}%` })
      .orderBy('medicine.dci', 'ASC')
      .take(20)
      .getMany();
  }

  async classes() {
    const rows = await this.medicinesRepository
      .createQueryBuilder('medicine')
      .select('DISTINCT medicine.drugClass', 'drugClass')
      .orderBy('medicine.drugClass', 'ASC')
      .getRawMany<{ drugClass: string }>();
    return rows.map((row) => row.drugClass);
  }

  async getById(id: string) {
    const medicine = await this.medicinesRepository.findOne({ where: { id } });
    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }
    return medicine;
  }

  create(dto: CreateMedicineDto) {
    return this.medicinesRepository.save(this.medicinesRepository.create(dto));
  }

  async update(id: string, dto: UpdateMedicineDto) {
    const medicine = await this.getById(id);
    Object.assign(medicine, dto);
    return this.medicinesRepository.save(medicine);
  }

  async remove(id: string) {
    const medicine = await this.getById(id);
    await this.medicinesRepository.remove(medicine);
    return { ok: true };
  }
}
