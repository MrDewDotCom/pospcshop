// Role → permission table (PLAN.md §8.2). The server checks these on every protected route;
// the UI uses the same table only to hide things it knows the user can't do.

import type { Role } from './enums';

const OWNER: readonly Role[] = ['owner'];
const EVERYONE: readonly Role[] = ['owner', 'staff'];

export const PERMISSIONS = {
  /** See cost, profit, inventory value, and receipt cost totals. */
  'cost.view': OWNER,

  'product.create': EVERYONE, // staff: non-money fields only, starts as "awaiting price"
  'product.editDetails': EVERYONE, // images, description, specs
  'product.editCore': OWNER, // name, category, SKU/barcode, condition, warranty, stock settings
  'product.editPricing': OWNER, // selling price, regular price, end discount, cost override
  'product.archive': OWNER,

  'category.manage': OWNER,
  'tag.manage': OWNER, // create custom tags and assign them to products

  'supplier.edit': EVERYONE,
  'supplier.archive': OWNER,

  'goodsReceipt.create': EVERYONE, // staff may type supplier costs (write-only, unverified)
  'goodsReceipt.verifyCost': OWNER,
  'goodsReceipt.void': OWNER,

  'stock.adjust': OWNER,
  'stock.checkIntegrity': OWNER,

  'sale.create': EVERYONE,
  'sale.void': OWNER,
  'return.create': EVERYONE,
  'return.resolve': EVERYONE,
  'return.editRefund': OWNER,

  'customer.edit': EVERYONE,
  'customer.archive': OWNER,

  'build.edit': EVERYONE,
  'build.editPricing': OWNER, // package price, labor fee
  'quote.edit': EVERYONE,

  'settings.manage': OWNER,
  'users.manage': OWNER,
  'backup.manage': OWNER,
  'audit.view': OWNER,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Every permission a role has, e.g. for GET /api/auth/me. */
export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

/**
 * Response keys that must never reach a staff user. Staff response schemas simply don't contain them;
 * this list backs the automated "no cost leak" test and a development-time assertion.
 */
export const STAFF_FORBIDDEN_KEYS = [
  'costSatang',
  'unitCostSatang',
  'lineCostSatang',
  'totalCostSatang',
  'provisionalCostSatang',
  'profitSatang',
  'marginBp',
  'inventoryValueSatang',
] as const;

/** Returns the JSON paths of any forbidden keys found anywhere inside `value`. */
export function findForbiddenKeys(
  value: unknown,
  forbidden: readonly string[] = STAFF_FORBIDDEN_KEYS,
  path = '$',
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, forbidden, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(forbidden.includes(key) ? [`${path}.${key}`] : []),
      ...findForbiddenKeys(child, forbidden, `${path}.${key}`),
    ]);
  }
  return [];
}
