// Shapes a response for the current user's role (PLAN.md §8.3). Each entity with cost data has an
// owner schema and a staff schema without cost fields. Zod strips keys a schema doesn't declare, so a
// field that's missing from the staff schema is never sent: forgetting a field fails safe.

import type { FastifyRequest } from 'fastify';
import type { z, ZodType } from 'zod';
import { findForbiddenKeys } from '@pcshop/shared';
import { unauthorized } from './errors';

export interface RoleSchemas<Owner extends ZodType, Staff extends ZodType> {
  owner: Owner;
  staff: Staff;
}

export function respondByRole<Owner extends ZodType, Staff extends ZodType>(
  request: FastifyRequest,
  schemas: RoleSchemas<Owner, Staff>,
  data: unknown,
): z.output<Owner> | z.output<Staff> {
  const user = request.user;
  if (!user) throw unauthorized();
  if (user.role === 'owner') return schemas.owner.parse(data);

  const shaped = schemas.staff.parse(data);
  // Defense in depth: a staff schema must never contain a cost key. Fail loudly rather than leak.
  const leaks = findForbiddenKeys(shaped);
  if (leaks.length > 0) {
    throw new Error(`Staff response contains forbidden keys: ${leaks.join(', ')}`);
  }
  return shaped;
}
