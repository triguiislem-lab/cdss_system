import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/entities/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TranslateFieldsDto, TranslateTextDto } from './dto/translation.dto';
import { TranslationService } from './translation.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Doctor)
@Controller('translations')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Get('languages')
  languages() {
    return this.translationService.getLanguages();
  }

  @Post('translate')
  async translate(@Body() dto: TranslateTextDto) {
    const translatedText = await this.translationService.translateText(
      dto.text,
      dto.target,
      dto.source,
    );

    return {
      source: dto.source || 'fr',
      target: dto.target,
      translatedText,
    };
  }

  @Post('translate-fields')
  translateFields(@Body() dto: TranslateFieldsDto) {
    return this.translationService.translateFields(
      dto.fields,
      dto.source,
      dto.targets,
    );
  }
}
