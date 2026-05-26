import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InteractionResult } from './interaction-result.entity';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([InteractionResult])],
  controllers: [InteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
