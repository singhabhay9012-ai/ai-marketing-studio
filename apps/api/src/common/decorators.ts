import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { OrgRole } from '@amp/shared-types';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: OrgRole;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}

export const IS_PUBLIC = 'isPublic';
/** Skip JWT authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const MIN_ROLE = 'minRole';
/**
 * Route requires an organisation context (x-organization-id header or
 * :organizationId param) and at least the given role in that organisation.
 */
export const RequireRole = (role: OrgRole) => SetMetadata(MIN_ROLE, role);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user!;
});

export const Tenant = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const tenant = ctx.switchToHttp().getRequest<AppRequest>().tenant;
  if (!tenant) throw new Error('Tenant() used on a route without @RequireRole()');
  return tenant;
});
