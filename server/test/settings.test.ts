import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fromBangkokParts } from '@pcshop/shared';
import { listLanAddresses } from '../src/lib/network';
import { allocateDocNumber } from '../src/services/numbering.service';
import { updateSequence } from '../src/modules/settings/service';
import { createStaff, createTestApp, patch, setUpShop } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('shop settings', () => {
  it('gives staff only the shop details, and the owner everything', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);

    const ownerView = (await owner.get('/api/settings')).json();
    expect(ownerView).toMatchObject({ shopName: 'ร้านคอมทดสอบ', defaultAssemblyFeeSatang: 0 });

    const staffView = (await staff.get('/api/settings')).json();
    expect(staffView.shopName).toBe('ร้านคอมทดสอบ');
    expect(staffView).not.toHaveProperty('defaultAssemblyFeeSatang');
    expect(staffView).not.toHaveProperty('recoveryCodeHash');
    expect(ownerView).not.toHaveProperty('recoveryCodeHash');
  });

  it('lets only the owner change settings, and validates input', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);

    expect((await patch(staff, '/api/settings', { shopName: 'x' })).statusCode).toBe(403);
    expect((await patch(owner, '/api/settings', { promptpayId: '12345' })).statusCode).toBe(400);
    expect((await patch(owner, '/api/settings', { logoFileId: 99 })).json().error.code).toBe(
      'LOGO_NOT_FOUND',
    );

    const res = await patch(owner, '/api/settings', {
      shopName: 'ร้านใหม่',
      receiptFooter: 'ขอบคุณที่ใช้บริการ',
      useBuddhistEra: false,
      defaultAssemblyFeeSatang: 50000,
    });
    expect(res.json()).toMatchObject({
      shopName: 'ร้านใหม่',
      useBuddhistEra: false,
      defaultAssemblyFeeSatang: 50000,
    });
    // The public setup status (login page) follows the new name.
    expect((await staff.get('/api/setup/status')).json().shopName).toBe('ร้านใหม่');

    const audit = (await owner.get('/api/audit-logs?action=settings.update')).json();
    expect(audit.items[0].detail.fields).toEqual(
      expect.arrayContaining(['shopName', 'useBuddhistEra']),
    );
  });
});

describe('document numbering', () => {
  const sep10 = fromBangkokParts(2026, 9, 10, 10);
  const sep30Late = fromBangkokParts(2026, 9, 30, 23, 59);
  const oct1 = fromBangkokParts(2026, 10, 1, 0, 1);

  it('allocates consecutive numbers that restart each Thai month', async () => {
    await setUpShop(app);
    const db = app.database.db;
    const next = (now: number) => db.transaction((tx) => allocateDocNumber(tx, 'sale', now));
    expect(next(sep10)).toBe('RC6909-0001');
    expect(next(sep30Late)).toBe('RC6909-0002');
    expect(next(oct1)).toBe('RC6910-0001'); // 00:01 on 1 Oct Thai time is already October
    expect(db.transaction((tx) => allocateDocNumber(tx, 'goods_receipt', oct1))).toBe(
      'GR6910-0001',
    );
  });

  it('follows the Buddhist Era setting', async () => {
    const { owner } = await setUpShop(app);
    await patch(owner, '/api/settings', { useBuddhistEra: false });
    const db = app.database.db;
    expect(db.transaction((tx) => allocateDocNumber(tx, 'sale', sep10))).toBe('RC2609-0001');
  });

  it('shows previews and validates new formats', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    expect((await staff.get('/api/settings/sequences')).statusCode).toBe(403);

    const list = (await owner.get('/api/settings/sequences')).json().items;
    expect(list).toHaveLength(8);
    expect(list[0]).toMatchObject({ docType: 'sale', format: 'RC{YY}{MM}-{SEQ:4}', lastNumber: 0 });
    expect(list[0].nextNumberPreview).toMatch(/^RC\d{4}-0001$/);

    const bad = await patch(owner, '/api/settings/sequences/sale', {
      format: 'RC{SEQ:4}',
      resetPolicy: 'monthly',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details.issues[0].path).toBe('format');

    const ok = await patch(owner, '/api/settings/sequences/sale', {
      format: 'INV{YYYY}-{SEQ:5}',
      resetPolicy: 'yearly',
    });
    expect(ok.json().nextNumberPreview).toMatch(/^INV\d{4}-00001$/);
  });

  it('keeps counting when the format changes mid-period, so numbers never repeat', async () => {
    const { owner } = await setUpShop(app);
    const db = app.database.db;
    const actor = (await owner.get('/api/auth/me')).json().user;
    const next = () => db.transaction((tx) => allocateDocNumber(tx, 'sale', sep10));
    next();
    next(); // RC6909-0002
    updateSequence(
      db,
      actor,
      'sale',
      { format: 'RC{YY}{MM}-{SEQ:4}', resetPolicy: 'yearly' },
      sep10,
    );
    expect(next()).toBe('RC6909-0003');
  });
});

describe('phone access', () => {
  it('lists LAN addresses for any logged-in user', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const res = await staff.get('/api/system/network');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ port: expect.any(Number), addresses: expect.any(Array) });
    expect((await staff.get('/api/system/info')).statusCode).toBe(403);
  });

  it('prefers real LAN adapters over virtual ones', () => {
    const iface = (address: string) => [
      { address, family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null },
    ];
    const result = listLanAddresses({
      'vEthernet (WSL)': iface('172.20.0.1'),
      'Wi-Fi': iface('192.168.1.50'),
      Loopback: [
        { address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '', mac: '', cidr: null },
      ],
      Ethernet: iface('169.254.10.1'),
    } as never);
    expect(result).toEqual([
      { address: '192.168.1.50', interfaceName: 'Wi-Fi', recommended: true },
      { address: '172.20.0.1', interfaceName: 'vEthernet (WSL)', recommended: false },
    ]);
  });
});
