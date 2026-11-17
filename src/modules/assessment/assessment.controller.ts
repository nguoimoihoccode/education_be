import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  Headers,
  Header,
  HttpCode,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SCHOOL_ADMIN_ROLES, UserRole } from '../../common/enums/roles.enum';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from '../school/school-http.util';
import { AssessmentService } from './assessment.service';
import * as D from './dto/assessment.dto';
@Controller('assessments')
@UseGuards(RolesGuard)
export class AssessmentController {
  constructor(private readonly service: AssessmentService) {}
  @Get('context')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  context(@Req() req: RequestWithUser) {
    const actor = requireUserId(req);
    return this.service.context(actor);
  }
  @Get('context/roster')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  roster(
    @Req() req: RequestWithUser,
    @Query('classId', ParseUUIDPipe) classId: string,
    @Query('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.roster(actor, classId, subjectId);
  }
  @Get('published/:publicationId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  published(
    @Req() req: RequestWithUser,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.published(actor, publicationId);
  }
  /** School-wide model spend per local day and per assessment. */
  @Get('cost-summary')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(...SCHOOL_ADMIN_ROLES)
  costSummary(
    @Req() req: RequestWithUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.schoolCostSummary(requireUserId(req), from, to);
  }
  /** Operations only: which class × subject scopes are open, paused or closed. */
  @Get('pilot-scopes')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.ADMIN)
  pilotScopes(
    @Query('schoolId', new ParseUUIDPipe({ optional: true }))
    schoolId?: string,
  ) {
    return this.service.pilotScopes(schoolId);
  }
  @Put('pilot-scopes')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.ADMIN)
  setPilotScope(@Req() req: RequestWithUser, @Body() dto: D.PilotScopeDto) {
    const actor = requireUserId(req);
    return this.service.setPilotScope(actor, dto);
  }
  @Post('')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  create(
    @Req() req: RequestWithUser,
    @Body() dto: D.AssessmentCreateDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.create(actor, dto, key);
  }
  @Get('')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  list(@Req() req: RequestWithUser, @Query() query: Record<string, string>) {
    const actor = requireUserId(req);
    return this.service.list(actor, query);
  }
  @Get(':assessmentId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  detail(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.detail(actor, assessmentId);
  }
  @Patch(':assessmentId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  patch(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.AssessmentPatchDto,
  ) {
    const actor = requireUserId(req);
    return this.service.patch(actor, assessmentId, dto);
  }
  @Post(':assessmentId/roster')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  addRoster(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.RosterDto,
  ) {
    const actor = requireUserId(req);
    return this.service.addRoster(actor, assessmentId, dto);
  }
  @Post(':assessmentId/submissions')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  createSubmission(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.SubmissionCreateDto,
  ) {
    const actor = requireUserId(req);
    return this.service.createSubmission(actor, assessmentId, dto);
  }
  @Get(':assessmentId/submissions')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  submissions(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Query() query: Record<string, string>,
  ) {
    const actor = requireUserId(req);
    return this.service.submissions(actor, assessmentId, query);
  }
  @Get(':assessmentId/submissions/:submissionId')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  submissionDetail(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.submissionDetail(actor, assessmentId, submissionId);
  }
  @Patch(':assessmentId/submissions/:submissionId/identity')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  identity(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.IdentityDto,
  ) {
    const actor = requireUserId(req);
    return this.service.identity(actor, assessmentId, submissionId, dto);
  }
  @Post(':assessmentId/uploads')
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  upload(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.UploadDto,
  ) {
    const actor = requireUserId(req);
    return this.service.upload(actor, assessmentId, dto);
  }
  @Post(':assessmentId/assets/:assetId/complete')
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  complete(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.complete(actor, assessmentId, assetId, key);
  }
  @Get(':assessmentId/assets/:assetId/content')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  async assetContent(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const content = await this.service.assetContent(
      requireUserId(req),
      id,
      assetId,
    );
    return new StreamableFile(content.bytes, {
      type: content.mime,
      disposition: content.disposition,
      length: content.bytes.length,
    });
  }
  @Get(':assessmentId/assets/:assetId/access')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  assetAccess(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.assetAccess(actor, assessmentId, assetId);
  }
  @Post(':assessmentId/submissions/:submissionId/manual-only')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(200)
  selectManualOnly(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ExternalTextRevokeDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.selectManualOnly(
      requireUserId(req),
      id,
      submissionId,
      dto,
      key,
    );
  }
  @Get(':assessmentId/submissions/:submissionId/external-text')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  externalTextPreview(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    return this.service.externalTextPreview(
      requireUserId(req),
      id,
      submissionId,
    );
  }
  @Post(':assessmentId/submissions/:submissionId/external-text')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  releaseExternalText(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ExternalTextReleaseDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.releaseExternalText(
      requireUserId(req),
      id,
      submissionId,
      dto,
      key,
    );
  }
  @Post(':assessmentId/submissions/:submissionId/external-text/revoke')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(200)
  revokeExternalText(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ExternalTextRevokeDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.revokeExternalText(
      requireUserId(req),
      id,
      submissionId,
      dto,
      key,
    );
  }
  @Get(':assessmentId/pages/:pageId/content')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  async pageContent(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Query('source') source?: string,
  ) {
    const content = await this.service.pageContent(
      requireUserId(req),
      id,
      pageId,
      source === 'original',
    );
    return new StreamableFile(content.bytes, {
      type: content.mime,
      disposition: content.disposition,
      length: content.bytes.length,
    });
  }
  @Get(':assessmentId/pages/:pageId/access')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  pageAccess(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Query('source') source?: string,
  ) {
    return this.service.pageAccess(
      requireUserId(req),
      assessmentId,
      pageId,
      source === 'original',
    );
  }
  @Patch(':assessmentId/pages/:pageId/selection')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  selection(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: D.PageSelectionDto,
  ) {
    const actor = requireUserId(req);
    return this.service.selection(actor, assessmentId, pageId, dto);
  }
  @Post(':assessmentId/process')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  process(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.ProcessDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.process(actor, assessmentId, dto, key);
  }
  @Get(':assessmentId/ai-agreement')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  aiAgreement(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.service.aiAgreement(requireUserId(req), assessmentId);
  }
  @Get(':assessmentId/costs')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  costReport(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.service.costReport(requireUserId(req), assessmentId);
  }
  @Get(':assessmentId/progress')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  progress(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.progress(actor, assessmentId);
  }
  @Get(':assessmentId/assets/:assetId/status')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  assetStatus(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.service.assetStatus(requireUserId(req), assessmentId, assetId);
  }
  @Post(':assessmentId/exam-imports')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  importExam(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.ExamImportDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.importExam(requireUserId(req), assessmentId, dto, key);
  }
  @Get(':assessmentId/exam-imports/:jobId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  getExamImport(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.service.getExamImport(requireUserId(req), assessmentId, jobId);
  }
  @Post(':assessmentId/submissions/:submissionId/exam-version')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  assignExamVersion(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.AssignExamVersionDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.assignExamVersion(
      requireUserId(req),
      assessmentId,
      submissionId,
      dto,
      key,
    );
  }
  @Post(':assessmentId/exam-versions')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  createVersion(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.ExamVersionDto,
  ) {
    const actor = requireUserId(req);
    return this.service.createVersion(actor, assessmentId, dto);
  }
  @Get(':assessmentId/exam-versions/:versionId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  version(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.version(actor, assessmentId, versionId);
  }
  @Get(':assessmentId/exam-versions/:versionId/impact')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  impact(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.impact(actor, assessmentId, versionId);
  }
  @Post(':assessmentId/exam-versions/:versionId/approve')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  approveVersion(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: D.ApproveVersionDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.approveVersion(
      actor,
      assessmentId,
      versionId,
      dto,
      key,
    );
  }
  @Patch(':assessmentId/submissions/:submissionId/answers/:questionKey')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  answer(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('questionKey') questionKey: string,
    @Body() dto: D.AnswerDto,
  ) {
    const actor = requireUserId(req);
    return this.service.answer(
      actor,
      assessmentId,
      submissionId,
      questionKey,
      dto,
    );
  }
  @Post(':assessmentId/submissions/:submissionId/reviews')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  review(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ReviewDto,
  ) {
    const actor = requireUserId(req);
    return this.service.review(actor, assessmentId, submissionId, dto);
  }
  @Post(':assessmentId/submissions/:submissionId/manual-review')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  manualReview(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ManualReviewDto,
  ) {
    return this.service.manualReview(
      requireUserId(req),
      assessmentId,
      submissionId,
      dto,
    );
  }
  @Post(':assessmentId/submissions/:submissionId/review-approval')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  approveReview(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: D.ApproveReviewDto,
  ) {
    return this.service.approveReview(
      requireUserId(req),
      assessmentId,
      submissionId,
      dto,
    );
  }
  @Post(':assessmentId/finalizations')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(200)
  finalize(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.FinalizationsDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.finalize(actor, assessmentId, dto, key);
  }
  @Post(':assessmentId/publications/:publicationId/withdraw')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(200)
  withdraw(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Body() dto: D.WithdrawDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.withdraw(actor, assessmentId, publicationId, dto, key);
  }
  @Post(':assessmentId/jobs/:jobId/retry')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  retry(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.retry(actor, assessmentId, jobId, key);
  }
  @Post(':assessmentId/exports')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(202)
  export(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: D.ExportDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = requireUserId(req);
    return this.service.export(actor, assessmentId, dto, key);
  }
  @Get(':assessmentId/exports/:exportId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  exportDetail(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.exportDetail(actor, assessmentId, exportId);
  }
  @Get(':assessmentId/exports/:exportId/content')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  async exportContent(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    const content = await this.service.exportContent(
      requireUserId(req),
      id,
      exportId,
    );
    return new StreamableFile(content.bytes, {
      type: content.mime,
      disposition: content.disposition,
      length: content.bytes.length,
    });
  }
  @Get(':assessmentId/exports/:exportId/access')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  exportAccess(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.exportAccess(actor, assessmentId, exportId);
  }
  @Post(':assessmentId/archive')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @HttpCode(200)
  archive(
    @Req() req: RequestWithUser,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    const actor = requireUserId(req);
    return this.service.archive(actor, assessmentId);
  }
}
