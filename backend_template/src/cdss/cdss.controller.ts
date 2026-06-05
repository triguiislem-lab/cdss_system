import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { User } from "../users/user.entity";
import { CdssService } from "./cdss.service";
import {
  CdssApproveDto,
  CdssClinicianFeedbackDto,
  CdssKgSearchQueryDto,
  CdssSearchQueryDto,
  CdssTnMedSearchQueryDto,
  CdssTraceFeedbackDto,
  DraftCdssPrescriptionDto,
  LocalizeCdssPlanDto,
  CdssRejectDto,
  CdssReviseDto,
  ValidateCdssPlanDto,
} from "./dto/cdss.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cdss")
export class CdssController {
  constructor(private readonly cdssService: CdssService) {}

  @Get("endpoints/catalog")
  endpointCatalog() {
    return this.cdssService.getEndpointCatalog();
  }

  @Get("health")
  health() {
    return this.cdssService.health();
  }

  @Get("system/status")
  systemStatus() {
    return this.cdssService.systemStatus();
  }

  @Get("system/model-cache")
  modelCache() {
    return this.cdssService.modelCache();
  }

  @Post("system/model-cache/warmup")
  modelCacheWarmup() {
    return this.cdssService.modelCacheWarmup();
  }

  @Post("system/qwen/warmup")
  qwenWarmup() {
    return this.cdssService.qwenWarmup();
  }

  @Get("system/readiness")
  readiness() {
    return this.cdssService.readiness();
  }

  @Post("prescriptions/draft")
  draft(@Body() dto: DraftCdssPrescriptionDto, @CurrentUser() user: User) {
    return this.cdssService.draft(dto, user);
  }

  @Post("prescriptions/analyze")
  analyze(@Body() dto: DraftCdssPrescriptionDto) {
    return this.cdssService.analyze(dto);
  }

  @Post("prescriptions/evidence")
  evidence(@Body() dto: DraftCdssPrescriptionDto) {
    return this.cdssService.evidence(dto);
  }

  @Post("prescriptions/validate-plan")
  validatePlan(@Body() dto: ValidateCdssPlanDto) {
    return this.cdssService.validatePlan(dto);
  }

  @Post("prescriptions/localize")
  localizePlan(@Body() dto: LocalizeCdssPlanDto) {
    return this.cdssService.localizePlan(dto);
  }

  @Get("formulary/search")
  searchFormulary(@Query() query: CdssSearchQueryDto) {
    return this.cdssService.searchFormulary(query.query, query.limit);
  }

  @Get("tn-med/search")
  searchTnMed(@Query() query: CdssTnMedSearchQueryDto) {
    return this.cdssService.searchTnMed(query.query, query.limit);
  }

  @Get("kg/search")
  searchKg(@Query() query: CdssKgSearchQueryDto) {
    return this.cdssService.searchKg(query.query, query.limit, {
      route: query.route,
      disease: query.disease,
      sourceMode: query.sourceMode,
    });
  }

  @Get("prescriptions/audit/:traceId")
  fetchIaAudit(@Param("traceId") traceId: string) {
    return this.cdssService.fetchIaAudit(traceId);
  }

  @Get("prescriptions/audit/:traceId/review-packet")
  fetchReviewPacket(@Param("traceId") traceId: string) {
    return this.cdssService.fetchReviewPacket(traceId);
  }

  @Get("audit/traces/:traceId")
  auditTrace(@Param("traceId") traceId: string) {
    return this.cdssService.auditTrace(traceId);
  }

  @Get("prescriptions/patient/:patientId/history")
  patientHistory(@Param("patientId") patientId: string) {
    return this.cdssService.patientHistory(patientId);
  }

  @Post("prescriptions/:traceId/feedback")
  submitTraceFeedback(
    @Param("traceId") traceId: string,
    @Body() dto: CdssTraceFeedbackDto,
  ) {
    return this.cdssService.submitTraceFeedback(traceId, dto);
  }

  @Post("prescriptions/:traceId/approve")
  approve(@Param("traceId") traceId: string, @Body() dto: CdssApproveDto) {
    return this.cdssService.approve(traceId, dto);
  }

  @Post("prescriptions/:traceId/reject")
  reject(@Param("traceId") traceId: string, @Body() dto: CdssRejectDto) {
    return this.cdssService.reject(traceId, dto);
  }

  @Post("prescriptions/:traceId/revise")
  revise(@Param("traceId") traceId: string, @Body() dto: CdssReviseDto) {
    return this.cdssService.revise(traceId, dto);
  }

  @Get("prescriptions/:traceId")
  getPrescriptionByTrace(@Param("traceId") traceId: string) {
    return this.cdssService.getPrescriptionByTrace(traceId);
  }

  @Post("feedback/clinician")
  clinicianFeedback(@Body() dto: CdssClinicianFeedbackDto) {
    return this.cdssService.clinicianFeedback(dto);
  }

  @Get("monitoring/overview")
  monitoringOverview() {
    return this.cdssService.monitoringOverview();
  }

  @Get("monitoring/pipeline")
  monitoringPipeline() {
    return this.cdssService.monitoringPipeline();
  }

  @Get("monitoring/performance")
  monitoringPerformance() {
    return this.cdssService.monitoringPerformance();
  }

  @Get("monitoring/model")
  monitoringModel() {
    return this.cdssService.monitoringModel();
  }

  @Get("monitoring/safety")
  monitoringSafety() {
    return this.cdssService.monitoringSafety();
  }

  @Get("monitoring/feedback")
  monitoringFeedback() {
    return this.cdssService.monitoringFeedback();
  }

  @Get("monitoring/feedback/summary")
  monitoringFeedbackSummary() {
    return this.cdssService.monitoringFeedbackSummary();
  }

  @Get("monitoring/retrieval")
  monitoringRetrieval() {
    return this.cdssService.monitoringRetrieval();
  }

  @Get("monitoring/localization")
  monitoringLocalization() {
    return this.cdssService.monitoringLocalization();
  }

  @Get("monitoring/clinical-quality")
  monitoringClinicalQuality() {
    return this.cdssService.monitoringClinicalQuality();
  }

  @Get("jobs/:kernelOwner/:kernelSlug/status")
  kaggleJobStatus(
    @Param("kernelOwner") kernelOwner: string,
    @Param("kernelSlug") kernelSlug: string,
  ) {
    return this.cdssService.getKaggleJobStatus(`${kernelOwner}/${kernelSlug}`);
  }

  @Post("jobs/:kernelOwner/:kernelSlug/fetch-result")
  kaggleFetchResult(
    @Param("kernelOwner") kernelOwner: string,
    @Param("kernelSlug") kernelSlug: string,
    @Body() body: { jobId?: string },
  ) {
    return this.cdssService.fetchKaggleJobResult(
      `${kernelOwner}/${kernelSlug}`,
      body?.jobId,
    );
  }
}
