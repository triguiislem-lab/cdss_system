import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import { CheckInteractionsDto, InteractionQueryDto } from './dto/interactions.dto';
import { InteractionResult } from './interaction-result.entity';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(InteractionResult)
    private readonly interactionsRepository: Repository<InteractionResult>,
  ) {}

  async findAll(query: InteractionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.interactionsRepository.createQueryBuilder('interaction');
    if (query.search) {
      const search = `%${query.search.toLowerCase()}%`;
      qb.where('LOWER(interaction.drugA) LIKE :search', {
        search,
      }).orWhere('LOWER(interaction.drugB) LIKE :search', {
        search,
      });
    }
    const [data, total] = await qb
      .orderBy('interaction.severity', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async check(dto: CheckInteractionsDto) {
    const drugs = dto.drugs.map((drug) => drug.trim().toLowerCase());
    if (drugs.length < 2) {
      return [];
    }
    const results = await this.interactionsRepository.find();
    return results.filter((interaction) => {
      const a = interaction.drugA.toLowerCase();
      const b = interaction.drugB.toLowerCase();
      return (
        (drugs.includes(a) && drugs.includes(b)) ||
        drugs.some((drug) => a.includes(drug) || b.includes(drug))
      );
    });
  }
}
