import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from './school-http.util';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SCHOOL_ADMIN_ROLES, UserRole } from '../../common/enums/roles.enum';
import { ParentLinkService } from './parent-link.service';
import { InviteParentDto } from './dto/parent-link.dto';

/**
 * Teaching space (Phase 2): the GVCN hub. Reads carry no @Roles on purpose:
 * the service confines them to the caller's own classes — `listMyHomeroomClasses`
 * returns [] for a non-GVCN and the roster/parents handlers go through
 * `assertClassAccess`, which 404s for anyone who is not that class's homeroom
 * teacher (or principal/ADMIN), per rule D1. Parent-invite writes stay
 * role-gated: they mint credentials, so they need both the role and the
 * per-class check.
 */
@ApiTags('school-teaching')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('school/teaching')
export class TeacherController {
  constructor(private readonly parentLinkService: ParentLinkService) {}

  @Get('classes')
  @ApiOperation({ summary: 'Classes where I am the homeroom teacher' })
  myClasses(@Req() req: RequestWithUser) {
    return this.parentLinkService.listMyHomeroomClasses(requireUserId(req));
  }

  @Get('classes/:id/students')
  @ApiOperation({ summary: 'Roster of one of my homeroom classes' })
  roster(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.parentLinkService.listClassRoster(requireUserId(req), id);
  }

  // ---------- parents of the class ----------

  @Get('classes/:id/parents')
  @ApiOperation({ summary: 'Parent links of the class (all statuses)' })
  parents(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.parentLinkService.listClassParents(requireUserId(req), id);
  }

  @Post('classes/:id/parents/invite')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Generate an invite code for a student + parent' })
  invite(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: InviteParentDto,
  ) {
    return this.parentLinkService.inviteParent(requireUserId(req), id, dto);
  }

  @Post('classes/:id/parents/:linkId/approve')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Approve a claimed invitation (D5 gate)' })
  approve(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.parentLinkService.approveLink(requireUserId(req), id, linkId);
  }

  @Post('classes/:id/parents/:linkId/revoke')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Revoke a parent link' })
  revoke(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.parentLinkService.revokeLink(requireUserId(req), id, linkId);
  }
}
