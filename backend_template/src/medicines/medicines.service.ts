import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { toPaginated } from '../common/dto/pagination.dto';
import {
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './dto/medicines.dto';
import { Medicine } from './medicine.entity';
import {
  FirebaseMedicament,
  FirebaseMedicineMedicalDetails,
  FirebaseMedicinesCatalog,
} from './firebase-medicines.catalog';
import {
  PregnancyStatus,
  ReimbursementRate,
} from '../common/entities/enums';

@Injectable()
export class MedicinesService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicinesRepository: Repository<Medicine>,
    private readonly firebaseCatalog: FirebaseMedicinesCatalog,
  ) {}

  async findAll(query: MedicineQueryDto) {
    if (this.firebaseCatalog.enabled()) {
      return this.findAllFromFirebase(query);
    }
    return this.findAllFromDatabase(query);
  }

  private async findAllFromDatabase(query: MedicineQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.medicinesRepository.createQueryBuilder('medicine');

    if (query.search) {
      const search = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(medicine.dci) LIKE :search')
            .orWhere('LOWER(medicine.localProductName) LIKE :search')
            .orWhere('LOWER(medicine.drugClass) LIKE :search')
            .orWhere('LOWER(medicine.therapeuticSubclass) LIKE :search')
            .orWhere('LOWER(medicine.dosage) LIKE :search')
            .orWhere('LOWER(medicine.form) LIKE :search')
            .orWhere('LOWER(medicine.presentation) LIKE :search')
            .orWhere('LOWER(medicine.amm) LIKE :search')
            .orWhere('LOWER(medicine.genericStatus) LIKE :search')
            .orWhere('LOWER(medicine.brands) LIKE :search');
        }),
      ).setParameter('search', search);
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
      .orderBy('medicine.localProductName', 'ASC')
      .addOrderBy('medicine.dci', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPaginated(data, total, page, limit);
  }

  async search(q?: string) {
    if (!q) {
      return [];
    }
    if (this.firebaseCatalog.enabled()) {
      const result = await this.findAllFromFirebase({ search: q, page: 1, limit: 20 });
      return result.data;
    }
    return this.medicinesRepository
      .createQueryBuilder('medicine')
      .where('LOWER(medicine.dci) LIKE :q', { q: `%${q.toLowerCase()}%` })
      .orWhere('LOWER(medicine.localProductName) LIKE :q', {
        q: `%${q.toLowerCase()}%`,
      })
      .orWhere('LOWER(medicine.brands) LIKE :q', { q: `%${q.toLowerCase()}%` })
      .orWhere('LOWER(medicine.amm) LIKE :q', { q: `%${q.toLowerCase()}%` })
      .orWhere('LOWER(medicine.presentation) LIKE :q', {
        q: `%${q.toLowerCase()}%`,
      })
      .orWhere('LOWER(medicine.dosage) LIKE :q', {
        q: `%${q.toLowerCase()}%`,
      })
      .orderBy('medicine.dci', 'ASC')
      .take(20)
      .getMany();
  }

  async classes() {
    if (this.firebaseCatalog.enabled()) {
      const medicines = await this.firebaseMedicines();
      return [...new Set(medicines.map((medicine) => medicine.drugClass).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right),
      );
    }
    const rows = await this.medicinesRepository
      .createQueryBuilder('medicine')
      .select('DISTINCT medicine.drugClass', 'drugClass')
      .orderBy('medicine.drugClass', 'ASC')
      .getRawMany<{ drugClass: string }>();
    return rows.map((row) => row.drugClass);
  }

  async getById(id: string) {
    if (this.firebaseCatalog.enabled()) {
      const remote = await this.firebaseCatalog.get(id);
      const sourceMedicineId = remote?.idMedicament;
      const amm = remote?.amm;
      if (sourceMedicineId && amm) {
        try {
          const details = await this.firebaseCatalog.getMedicalDetails(sourceMedicineId, amm);
          const detailedRemote = details.medicaments[0] ?? remote;
          if (detailedRemote) {
            return this.mapFirebaseMedicine(detailedRemote, details);
          }
        } catch (error) {
          if (!remote) throw error;
        }
      }
      if (remote) return this.mapFirebaseMedicine(remote);
      throw new NotFoundException('Medicine not found');
    }
    const medicine = await this.medicinesRepository.findOne({ where: { id } });
    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }
    return medicine;
  }

  create(dto: CreateMedicineDto) {
    this.assertWritableCatalog();
    return this.medicinesRepository.save(this.medicinesRepository.create(dto));
  }

  async update(id: string, dto: UpdateMedicineDto) {
    this.assertWritableCatalog();
    const medicine = await this.getById(id);
    Object.assign(medicine, dto);
    return this.medicinesRepository.save(medicine);
  }

  async remove(id: string) {
    this.assertWritableCatalog();
    const medicine = await this.getById(id);
    await this.medicinesRepository.remove(medicine);
    return { ok: true };
  }

  private assertWritableCatalog() {
    if (this.firebaseCatalog.enabled()) {
      throw new ConflictException(
        'The Firebase medicine catalogue is the source of truth and is read-only from this API.',
      );
    }
  }

  private async findAllFromFirebase(query: MedicineQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim().toLocaleLowerCase();
    let medicines = await this.firebaseMedicines();

    if (search) {
      medicines = medicines.filter((medicine) =>
        [
          medicine.dci,
          medicine.localProductName,
          medicine.drugClass,
          medicine.therapeuticSubclass,
          medicine.dosage,
          medicine.form,
          medicine.presentation,
          medicine.amm,
          ...(medicine.brands ?? []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(search)),
      );
    }
    if (query.drugClass) {
      medicines = medicines.filter((medicine) => medicine.drugClass === query.drugClass);
    }
    if (query.pregnancy) {
      medicines = medicines.filter((medicine) => medicine.pregnancy === query.pregnancy);
    }
    if (query.renalAdjust !== undefined) {
      medicines = medicines.filter(
        (medicine) => medicine.renalAdjust === (query.renalAdjust === 'true'),
      );
    }
    if (query.hepaticAdjust !== undefined) {
      medicines = medicines.filter(
        (medicine) => medicine.hepaticAdjust === (query.hepaticAdjust === 'true'),
      );
    }

    medicines.sort((left, right) =>
      (left.localProductName || left.dci).localeCompare(right.localProductName || right.dci),
    );
    const total = medicines.length;
    const offset = (page - 1) * limit;
    return toPaginated(medicines.slice(offset, offset + limit), total, page, limit);
  }

  private async firebaseMedicines() {
    return (await this.firebaseCatalog.list()).map((remote) =>
      this.mapFirebaseMedicine(remote),
    );
  }

  private mapFirebaseMedicine(
    remote: FirebaseMedicament,
    details?: FirebaseMedicineMedicalDetails,
  ): Medicine {
    const productName = remote.nomMedicament?.trim() || '';
    const substances = uniqueStrings(
      details?.substances.map((substance) => substance.dciSource) ?? [],
    );
    const dci =
      remote.dciRaw?.trim() || substances.join(' + ') || productName ||
      'DCI non renseignée';
    const classification = details?.classifications[0];
    const acceptedPosologies = acceptedRules(details?.posologies);
    const acceptedContraindications = acceptedRules(details?.contraindications);
    const acceptedAdverseEffects = acceptedRules(details?.adverseEffects);
    const acceptedInteractions = acceptedRules(details?.interactions);
    const acceptedSafety = acceptedRules(details?.safetyRules);
    const acceptedSpecialPopulations = acceptedRules(details?.specialPopulations);
    const acceptedOverdoseEvidence = acceptedRules(details?.overdoseEvidence);
    const clinicalText = [
      ...acceptedSafety,
      ...acceptedSpecialPopulations,
    ]
      .flatMap(ruleTexts)
      .join(' ')
      .toLocaleLowerCase();
    const pregnancy = inferPregnancy(clinicalText);
    const prices = details?.prices ?? [];
    const publicPrices = uniqueNumbers([
      remote.prixPublicMinTnd,
      remote.prixPublicMaxTnd,
      ...prices.map((price) => price.prixPublicNumerique || price.prixNumerique),
    ]);
    const referenceTariffs = uniqueNumbers([
      remote.tarifReferenceMinTnd,
      remote.tarifReferenceMaxTnd,
      ...prices.map((price) => price.tarifReferenceNumerique),
    ]);
    const reimbursementRates = uniqueNumbers(
      prices.map((price) => price.tauxRemboursementNumerique),
    );
    const reimbursementCategory =
      remote.categorieRemboursement ||
      prices.find((price) => price.categorie)?.categorie;
    const reimbursementRatePercent = reimbursementRates.length
      ? Math.max(...reimbursementRates)
      : undefined;
    const document = details?.documents[0];
    const sourceSystems = uniqueStrings([
      ...(remote.sourcesPresentes?.split(';') ?? []),
      ...prices.map((price) => price.sourceName),
      ...acceptedPosologies.map((rule) => rule.sourceSystem),
      ...acceptedContraindications.map((rule) => rule.sourceSystem),
      ...acceptedAdverseEffects.map((rule) => rule.sourceSystem),
      ...acceptedInteractions.map((rule) => rule.sourceSystem),
      ...acceptedSafety.map((rule) => rule.sourceSystem),
      ...acceptedSpecialPopulations.map((rule) => rule.sourceSystem),
      ...acceptedOverdoseEvidence.map((evidence) => evidence.sourceSystem),
    ]);
    const indications = uniqueStrings([
      remote.indicationsRaw,
      ...(details?.indications.map((indication) => indication.indicationsRaw) ?? []),
    ].map((value) => cleanLogicalText(value, {
      fixedWidthLimit: 250,
      allowCommaBoundary: true,
      preserveBulletLines: true,
    })));
    const contraindications = uniqueStrings(
      acceptedContraindications.flatMap((rule) => [
        cleanLogicalText(rule.recommandation, {
          stopAt: /(?:^|\s)\d{1,2}(?:\.\d+)*\.?\s+(?:Mises en garde|Warnings and Precautions|Effets indésirables|Adverse Reactions)\b/i,
        }),
        rule.conditionOuFacteur,
        rule.actionRecommandee,
      ]).map((value) => cleanLogicalText(value)),
    );
    const posologies = uniqueStrings(
      acceptedPosologies.map((rule) => cleanLogicalText(formatPosology(rule))),
    );
    const adverseEffects = uniqueStrings(
      acceptedAdverseEffects.flatMap((rule) => [
        rule.effetClinique,
        rule.recommandation,
        rule.conditionOuFacteur,
      ]).map((value) => cleanLogicalText(value))
        .filter((value) => value !== undefined && !isGenericClinicalLabel(value)),
    );
    const interactions = uniqueStrings(
      acceptedInteractions.map((rule) => cleanLogicalText(formatInteraction(rule))),
    );
    const warnings = uniqueStrings(
      acceptedSafety
        .flatMap((rule) => [rule.recommandation, rule.actionRecommandee])
        .map((value) => cleanLogicalText(value)),
    );
    const specialPopulations = uniqueStrings(
      acceptedSpecialPopulations.map((rule) => cleanLogicalText(rule.recommandation, {
        stopAt: /(?:^|\s)\d{1,2}(?:\.\d+)*\.?\s+(?:Effets sur l['’]aptitude|Effects on Ability|Surdosage|Overdosage)\b/i,
      })),
    );
    const overdose = uniqueStrings(
      acceptedOverdoseEvidence.map((evidence) => cleanLogicalText(evidence.textePreuve, {
        stopAt: /(?:^|\s)\d{1,2}(?:\.\d+)*\.?\s+(?:Propriétés pharmacologiques|Pharmacological Properties)\b/i,
      })),
    );
    return {
      id: formatFirebaseUuid(remote.id),
      sourceMedicineId: remote.idMedicament,
      localProductName: productName,
      dci,
      brands: productName ? [productName] : [],
      atcCode: '',
      sourceKey: remote.cleMedicament,
      drugClass:
        classification?.classeTherapeutique || remote.classeTherapeutique ||
        'Non classé',
      therapeuticSubclass:
        classification?.sousClasseTherapeutique || remote.sousClasseTherapeutique,
      dosage: remote.dosage,
      form: remote.forme,
      presentation: remote.presentation,
      forms: [[remote.dosage, remote.forme, remote.presentation].filter(Boolean).join(' - ')]
        .filter(Boolean),
      laboratories: remote.laboratoire ? [remote.laboratoire] : [],
      amm: remote.amm,
      ammDate: remote.dateAmm,
      genericStatus: remote.statutGp,
      tableau: remote.tableau,
      veicStatus: remote.veicStatus,
      conservationDurationMonths: remote.dureeConservation,
      primaryPackaging: remote.conditionnementPrimaire,
      packagingSpecification: remote.specificationConditionnement,
      reimbursement: inferReimbursement(reimbursementRatePercent, reimbursementCategory),
      reimbursementCategory,
      reimbursementRatePercent,
      referenceTariffTnd:
        referenceTariffs.length ? Math.max(...referenceTariffs) : undefined,
      publicPriceMinTnd:
        publicPrices.length ? Math.min(...publicPrices) : undefined,
      publicPriceMaxTnd:
        publicPrices.length ? Math.max(...publicPrices) : undefined,
      indication: indications.join('\n') || 'Non renseigné',
      contraindications,
      posologyAdult: posologies.join('\n\n') || 'Non renseigné',
      pregnancy,
      renalAdjust: containsClinicalTerm(clinicalText, ['rénal', 'renal', 'rein']),
      hepaticAdjust: containsClinicalTerm(clinicalText, ['hépat', 'hepat', 'foie']),
      priceTndApprox:
        publicPrices.length
          ? (Math.min(...publicPrices) + Math.max(...publicPrices)) / 2
          : undefined,
      detailUrl: remote.detailUrl || document?.detailUrl,
      rcpUrl: remote.rcpUrl || document?.rcpUrl,
      noticeUrl: remote.noticeUrl || document?.noticeUrl,
      sourceReference: remote.sourceReference,
      sourceSystems,
      adverseEffects,
      interactions,
      warnings,
      specialPopulations,
      overdose,
    } as unknown as Medicine;
  }
}

function acceptedRules<T extends { accepteUsageClinique?: string }>(rules?: T[]) {
  return (rules ?? []).filter(
    (rule) => !rule.accepteUsageClinique || ['1', 'true', 'oui', 'yes'].includes(
      rule.accepteUsageClinique.toLocaleLowerCase(),
    ),
  );
}

/**
 * Keeps the useful complete part of a source excerpt without displaying a
 * dangling word or a generated ellipsis. It is deliberately display-facing:
 * the source value in Firebase remains unchanged and traceable.
 */
function cleanLogicalText(
  value: string | undefined,
  options: {
    fixedWidthLimit?: number;
    fixedWidthLimits?: number[];
    allowCommaBoundary?: boolean;
    preserveBulletLines?: boolean;
    stopAt?: RegExp;
  } = {},
) {
  let normalized = value?.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return undefined;

  const sectionBoundary = options.stopAt?.exec(normalized);
  if (sectionBoundary) normalized = normalized.slice(0, sectionBoundary.index).trim();

  const hasGeneratedEllipsis = normalized.endsWith('...');
  const unmatchedOpeningGroup = findLastUnmatchedOpeningGroup(normalized);
  const fixedWidthLimits = options.fixedWidthLimits ?? (
    options.fixedWidthLimit !== undefined ? [options.fixedWidthLimit] : [250, 900]
  );
  // The final dot in a generated ellipsis is not a sentence boundary.
  const hasTerminalPunctuation = !hasGeneratedEllipsis && /[.!?;]$/.test(normalized);
  const hasFixedWidthTail = fixedWidthLimits.some((limit) => normalized.length === limit) &&
    !hasTerminalPunctuation;
  const hasLongIncompleteTail = normalized.length >= 200 && !hasTerminalPunctuation;

  if (
    !hasGeneratedEllipsis &&
    !hasFixedWidthTail &&
    !hasLongIncompleteTail &&
    unmatchedOpeningGroup < 0
  ) {
    return normalizeEvidenceText(
      stripBibliographicReferences(normalized),
      options.preserveBulletLines,
    );
  }

  let withoutEllipsis = normalized.replace(/\.{3}\s*$/, '').trim();
  const removedIncompleteGroup = unmatchedOpeningGroup >= 0;
  if (removedIncompleteGroup) {
    withoutEllipsis = withoutEllipsis.slice(0, unmatchedOpeningGroup).trim();
  }
  // When an excerpt has no terminal sentence punctuation, a closing
  // parenthesis can only close an incomplete fragment (for example
  // "... (dont aripiprazole)"). Do not use it as the logical cut point.
  const boundaryPattern = hasLongIncompleteTail
    ? /[.!?;](?=\s|$)/g
    : /[.!?;)\]}](?=\s|$)/g;
  let lastBoundary = -1;
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(withoutEllipsis)) !== null) {
    lastBoundary = match.index + match[0].length;
  }

  if (
    lastBoundary < 0 &&
    options.allowCommaBoundary &&
    (hasFixedWidthTail || hasGeneratedEllipsis)
  ) {
    const commaBoundary = withoutEllipsis.lastIndexOf(',');
    if (commaBoundary > 0) lastBoundary = commaBoundary + 1;
  }

  if (lastBoundary > 0) {
    return normalizeEvidenceText(
      stripBibliographicReferences(withoutEllipsis.slice(0, lastBoundary).trim()),
      options.preserveBulletLines,
    );
  }

  if (removedIncompleteGroup) {
    return normalizeEvidenceText(
      stripBibliographicReferences(withoutEllipsis),
      options.preserveBulletLines,
    );
  }

  const lastLineBreak = withoutEllipsis.lastIndexOf('\n');
  if (lastLineBreak <= 0 && (hasFixedWidthTail || hasGeneratedEllipsis || hasLongIncompleteTail)) {
    return undefined;
  }
  const logicalText = lastLineBreak > 0
    ? withoutEllipsis.slice(0, lastLineBreak).trim()
    : withoutEllipsis;
  return normalizeEvidenceText(
    stripBibliographicReferences(logicalText),
    options.preserveBulletLines,
  );
}

function findLastUnmatchedOpeningGroup(value: string) {
  const stack: Array<{ character: string; index: number }> = [];
  const closingToOpening: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (['(', '[', '{'].includes(character)) {
      stack.push({ character, index });
      continue;
    }
    const expectedOpening = closingToOpening[character];
    if (expectedOpening && stack.at(-1)?.character === expectedOpening) {
      stack.pop();
    }
  }

  return stack.at(-1)?.index ?? -1;
}

function stripBibliographicReferences(value: string) {
  return value
    .replace(/\(\s*voir\.?\s+(?:la\s+)?rubrique\s+\d+(?:\.\d+)*\s*\)/gi, '')
    .replace(/\bvoir\.?\s+(?:la\s+)?rubrique\s+\d+(?:\.\d+)*\.?/gi, '')
    .replace(/\[\s*(?:see|voir|cf\.?|refer(?:red)?\s+to)\b[^\]]*\]/gi, '')
    // Remove regulatory cross-references such as "(2.4, 7.1)" while
    // keeping clinical quantities such as "(50 mg)" or "(5 %)".
    .replace(/\(\s*\d{1,2}(?:\.\d+)*(?:\s*,\s*\d{1,2}(?:\.\d+)*)*\s*\)/g, '')
    .replace(/\s+mentionn[^\s]+\s+(?:à|dans)\s+(?:la\s+)?rubrique\s+\d+(?:\.\d+)*\.?/gi, '')
    .replace(/\s+(?:à|dans)\s+(?:la\s+)?rubrique\s+\d+(?:\.\d+)*\.?/gi, '')
    .replace(
      /(^|\s)\d{1,2}(?:\.\d+)*\.?\s+(?:DOSAGE AND ADMINISTRATION|RECOMMENDED(?: DOSAGE)?|CONTRAINDICATIONS|ADVERSE REACTIONS|WARNINGS AND PRECAUTIONS|USE IN SPECIFIC POPULATIONS|OVERDOSAGE|DRUG INTERACTIONS|CONTRE-?INDICATIONS|MISES EN GARDE(?: SP[ÉE]CIALES)?(?: ET)? PR[ÉE]CAUTIONS D['’]EMPLOI|EFFETS IND[ÉE]SIRABLES|EFFETS SUR L['’]APTITUDE[^.]*|SURDOSAGE|PROPRI[ÉE]T[ÉE]S PHARMACOLOGIQUES)\b\s*/gi,
      '$1',
    )
    .replace(
      /(^|\s)\d{1,2}(?:\.\d+)*\.?(?=\s+(?:DOSAGE|RECOMMENDED|CONTRAINDICATIONS|ADVERSE|WARNINGS|USE|OVERDOSAGE|CONTRE|MISES|EFFETS|SURDOSAGE|PROPRI|POSOLOGIE|INTERACTIONS)\b)/gi,
      '$1',
    )
    .replace(/(^|\s)"(?=\s*[A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1');
}

function normalizeEvidenceText(value: string, preserveBulletLines = false) {
  const bulletMarker = '__MEDCITY_BULLET_LINE__';
  const normalized = preserveBulletLines
    ? value
      .replace(/\n(?=\s*[-•])/g, bulletMarker)
      .replace(/\s+/g, ' ')
      .replaceAll(bulletMarker, '\n')
    : value.replace(/\s+/g, ' ');
  return normalized
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.!?])\1+/g, '$1')
    .replace(/[,:]\s*$/, '')
    .trim();
}

function ruleTexts(rule: {
  population?: string;
  conditionOuFacteur?: string;
  actionRecommandee?: string;
  recommandation?: string;
  citationPreuve?: string;
}) {
  return [
    rule.population,
    rule.conditionOuFacteur,
    rule.actionRecommandee,
    rule.recommandation,
    rule.citationPreuve,
  ].filter(Boolean) as string[];
}

function formatPosology(rule: {
  recommandation?: string;
  valeurDose?: string;
  uniteDose?: string;
  frequence?: string;
  duree?: string;
  voieAdministration?: string;
}) {
  if (rule.recommandation?.trim()) return rule.recommandation.trim();
  return uniqueStrings([
    [rule.valeurDose, rule.uniteDose].filter(Boolean).join(' '),
    rule.frequence,
    rule.duree,
    rule.voieAdministration,
  ]).join(' · ');
}

function formatInteraction(rule: {
  medicamentOuSubstanceCible?: string;
  effetClinique?: string;
  mecanisme?: string;
  actionRecommandee?: string;
  recommandation?: string;
}) {
  const target = rule.medicamentOuSubstanceCible?.trim();
  const detail = uniqueStrings([
    rule.effetClinique,
    rule.mecanisme,
    rule.actionRecommandee,
    rule.recommandation,
  ]).join(' — ');
  return [target, detail].filter(Boolean).join(': ');
}

function inferPregnancy(text: string, fallback?: PregnancyStatus) {
  const pregnancyMentioned = containsClinicalTerm(text, [
    'grossesse',
    'pregnan',
    'allait',
    'lactation',
    'breast-feeding',
    'fertility',
  ]);
  if (!pregnancyMentioned) return fallback ?? PregnancyStatus.Precaution;
  if (containsClinicalTerm(text, ['contre-indiqu', 'contraindicat', 'ne doit pas'])) {
    return PregnancyStatus.Contraindicated;
  }
  return PregnancyStatus.Precaution;
}

function inferReimbursement(rate?: number, category?: string) {
  if (rate !== undefined) {
    if (rate >= 95) return ReimbursementRate.Full;
    if (rate >= 70) return ReimbursementRate.High;
    if (rate > 0) return ReimbursementRate.Partial;
  }
  return category ? ReimbursementRate.Partial : ReimbursementRate.None;
}

function containsClinicalTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function isGenericClinicalLabel(value: string) {
  return [
    'effet indésirable',
    'effets indésirables',
    'adverse effect',
    'adverse effects',
  ].includes(value.trim().toLocaleLowerCase());
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function uniqueNumbers(values: Array<string | number | undefined>) {
  return [...new Set(values.map(parseOptionalNumber).filter((value) => value !== undefined))] as number[];
}

function parseOptionalNumber(value: string | number | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const normalized = value?.trim().replace(',', '.');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatFirebaseUuid(value: string) {
  const compact = value.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return value;
  return [compact.slice(0, 8), compact.slice(8, 12), compact.slice(12, 16), compact.slice(16, 20), compact.slice(20)].join('-');
}
