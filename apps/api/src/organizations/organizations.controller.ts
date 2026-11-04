import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ORG_ROLES } from '@amp/shared-types';
import { createOrganizationSchema, inviteMemberSchema } from '@amp/validation';
import { AuthUser, CurrentUser, RequireRole, Tenant, TenantContext } from '../common/decorators';
import { ApiZodBody, ZodBody } from '../common/zod';
import { OrganizationsService } from './organizations.service';

const roleSchema = z.object({ role: z.enum(ORG_ROLES) });
const acceptSchema = z.object({ token: z.string().min(20) });

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.id);
  }

  @Post()
  @ApiZodBody(createOrganizationSchema)
  create(@CurrentUser() user: AuthUser, @ZodBody(createOrganizationSchema) body: z.infer<typeof createOrganizationSchema>) {
    return this.orgs.create(user.id, body);
  }

  @Get(':organizationId')
  @RequireRole('VIEWER')
  get(@Tenant() t: TenantContext) {
    return this.orgs.get(t);
  }

  @Patch(':organizationId')
  @RequireRole('ADMIN')
  @ApiZodBody(createOrganizationSchema)
  update(@Tenant() t: TenantContext, @ZodBody(createOrganizationSchema.partial()) body: { name?: string }) {
    return this.orgs.update(t, body);
  }

  @Delete(':organizationId')
  @RequireRole('OWNER')
  @HttpCode(204)
  remove(@Tenant() t: TenantContext) {
    return this.orgs.softDelete(t);
  }

  @Get(':organizationId/members')
  @RequireRole('VIEWER')
  members(@Tenant() t: TenantContext) {
    return this.orgs.listMembers(t);
  }

  @Patch(':organizationId/members/:userId')
  @RequireRole('ADMIN')
  @ApiZodBody(roleSchema)
  changeRole(
    @Tenant() t: TenantContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ZodBody(roleSchema) body: z.infer<typeof roleSchema>,
  ) {
    return this.orgs.changeRole(t, userId, body.role);
  }

  /** Admins remove others; any member may remove themselves (leave). */
  @Delete(':organizationId/members/:userId')
  @RequireRole('VIEWER')
  @HttpCode(204)
  removeMember(@Tenant() t: TenantContext, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.orgs.removeMember(t, userId);
  }

  @Post(':organizationId/invitations')
  @RequireRole('ADMIN')
  @ApiZodBody(inviteMemberSchema)
  invite(@Tenant() t: TenantContext, @ZodBody(inviteMemberSchema) body: z.infer<typeof inviteMemberSchema>) {
    return this.orgs.invite(t, body);
  }

  @Get(':organizationId/invitations')
  @RequireRole('ADMIN')
  invitations(@Tenant() t: TenantContext) {
    return this.orgs.listInvitations(t);
  }

  @Delete(':organizationId/invitations/:invitationId')
  @RequireRole('ADMIN')
  @HttpCode(204)
  revoke(@Tenant() t: TenantContext, @Param('invitationId', ParseUUIDPipe) id: string) {
    return this.orgs.revokeInvitation(t, id);
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post('accept')
  @HttpCode(200)
  @ApiZodBody(acceptSchema)
  accept(@CurrentUser() user: AuthUser, @ZodBody(acceptSchema) body: z.infer<typeof acceptSchema>) {
    return this.orgs.acceptInvitation(user, body.token);
  }
}
