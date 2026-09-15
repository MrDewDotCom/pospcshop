// PLAN.md §8.3 (4): call EVERY registered GET route as staff and scan each JSON response for cost keys.
// Routes are read from app.routeTable, so a new GET route is covered automatically — and fails here
// until it has a fixture (if it needs params or a query) and passes the scan.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { findForbiddenKeys } from '@pcshop/shared';
import { createTestApp } from './helpers';
import { seedEverything, type SeededShop } from './securityFixtures';

let app: FastifyInstance;
let shop: SeededShop;
beforeAll(async () => {
  app = await createTestApp();
  shop = await seedEverything(app);
});
afterAll(() => app.close());

/**
 * Concrete requests per route pattern. Routes without params get their plain URL automatically;
 * list extra variants (filters, archived rows, …) here so every code path that shapes data is scanned.
 */
function fixtures({ ids, codes }: SeededShop): Record<string, string[]> {
  const products = [ids.ram, ids.cpu, ids.awaitingPrice, ids.archived];
  const receipts = [ids.verifiedReceipt, ids.unverifiedReceipt, ids.voidedReceipt];
  return {
    '/api/products': [
      '/api/products',
      '/api/products?status=archived',
      '/api/products?status=awaitingPrice',
      '/api/products?discounted=true',
      '/api/products?stock=low',
      `/api/products?tagId=${ids.tag}`,
      '/api/products?sort=price',
      `/api/products?q=${codes.serial}`,
    ],
    '/api/products/lookup': [
      `/api/products/lookup?code=${codes.barcode}`,
      `/api/products/lookup?code=${codes.serial}`,
    ],
    '/api/products/:id': products.map((id) => `/api/products/${id}`),
    '/api/products/:id/price-history': products.map((id) => `/api/products/${id}/price-history`),
    '/api/products/:id/movements': products.map((id) => `/api/products/${id}/movements`),
    '/api/products/:id/serials': [
      `/api/products/${ids.cpu}/serials`,
      `/api/products/${ids.cpu}/serials?status=written_off`,
    ],
    '/api/suppliers': ['/api/suppliers', '/api/suppliers?includeArchived=true'],
    '/api/suppliers/:id': [`/api/suppliers/${ids.supplier}`],
    '/api/goods-receipts': [
      '/api/goods-receipts',
      '/api/goods-receipts?costStatus=unverified',
      '/api/goods-receipts?status=voided',
    ],
    '/api/goods-receipts/:id': receipts.map((id) => `/api/goods-receipts/${id}`),
    '/api/stock/movements': [
      '/api/stock/movements',
      '/api/stock/movements?type=receive',
      '/api/stock/movements?type=void',
      `/api/stock/movements?q=${codes.adjustmentDocNo}`,
    ],
    '/api/serials': ['/api/serials', '/api/serials?q=S-', '/api/serials?status=written_off'],
    '/api/tags': ['/api/tags', '/api/tags?includeArchived=true'],
    '/api/categories': ['/api/categories', '/api/categories?includeArchived=true'],
    '/api/customers': [
      '/api/customers',
      '/api/customers?q=0899',
      '/api/customers?includeArchived=true',
    ],
    '/api/customers/phone-matches': ['/api/customers/phone-matches?phone=0899990000'],
    '/api/customers/:id': [`/api/customers/${ids.customer}`],
    '/api/customers/:id/history': [`/api/customers/${ids.customer}/history`],
    '/api/sales': [
      '/api/sales',
      '/api/sales?mine=true',
      '/api/sales?q=S-',
      '/api/sales?status=paid',
    ],
    '/api/sales/:id': [`/api/sales/${ids.sale}`],
    '/api/returns': ['/api/returns', '/api/returns?pending=true', '/api/returns?q=RT'],
    '/api/returns/:id': [`/api/returns/${ids.saleReturn}`],
  };
}

const getRoutes = () =>
  app.routeTable
    .filter((r) => r.method === 'GET' && r.url.startsWith('/api/'))
    .map((r) => r.url)
    .sort();

describe('no cost leak to staff', () => {
  it('every GET route has requests to make (add a fixture for new routes with params)', () => {
    const table = fixtures(shop);
    const routes = getRoutes();
    const missing = routes.filter((url) => /[:*]/.test(url) && !table[url]);
    expect(missing, 'GET routes with params need an entry in fixtures()').toEqual([]);
    const stale = Object.keys(table).filter((url) => !routes.includes(url));
    expect(stale, 'fixtures() lists routes that no longer exist').toEqual([]);
  });

  it('staff responses never contain cost keys, on any GET route', async () => {
    const table = fixtures(shop);
    const problems: string[] = [];
    const ownerRoutesWithCost = new Set<string>();

    for (const route of getRoutes()) {
      for (const url of table[route] ?? [route]) {
        const res = await shop.staff.get(url);
        if (res.statusCode === 403) continue; // owner-only route: nothing is sent
        if (res.statusCode !== 200) {
          problems.push(`${url} → ${res.statusCode} as staff (fix the fixture): ${res.body}`);
          continue;
        }
        const leaks = findForbiddenKeys(res.json());
        if (leaks.length) problems.push(`${url} leaks ${leaks.slice(0, 5).join(', ')}`);

        const ownerRes = await shop.owner.get(url);
        if (findForbiddenKeys(ownerRes.json()).length) ownerRoutesWithCost.add(route);
      }
    }
    expect(problems).toEqual([]);

    // Sanity: the seed produced cost data where cost lives, so a leak would have been caught.
    expect([...ownerRoutesWithCost].sort()).toEqual(
      [
        '/api/customers/:id/history',
        '/api/returns/:id',
        '/api/sales',
        '/api/sales/:id',
        '/api/goods-receipts',
        '/api/goods-receipts/:id',
        '/api/products',
        '/api/products/:id',
        '/api/products/:id/movements',
        '/api/products/:id/serials',
        '/api/products/lookup',
        '/api/serials',
        '/api/stock/movements',
      ].sort(),
    );
  });

  it('refuses sorting or filtering by cost', async () => {
    expect((await shop.staff.get('/api/products?sort=cost')).statusCode).toBe(400);
    expect((await shop.staff.get('/api/products?sort=costSatang')).statusCode).toBe(400);
  });

  it('keeps owner-only data owner-only (audit log, integrity, users, sequences, system info)', async () => {
    for (const url of [
      '/api/audit-logs',
      '/api/stock/integrity',
      '/api/users',
      '/api/settings/sequences',
      '/api/system/info',
    ]) {
      expect((await shop.staff.get(url)).statusCode, url).toBe(403);
    }
  });
});
