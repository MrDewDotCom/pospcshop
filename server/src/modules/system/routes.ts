import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { APP_VERSION, type NetworkInfoResponse } from '@pcshop/shared';
import { DEFAULT_PORT } from '../../config';
import { listLanAddresses } from '../../lib/network';
import { requirePermission } from '../../plugins/auth';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // Any logged-in user: staff also need the address to open the app on a phone.
  app.get('/api/system/network', async (): Promise<NetworkInfoResponse> => {
    const address = app.server.address() as AddressInfo | null;
    return {
      hostname: os.hostname(),
      port: address?.port ?? DEFAULT_PORT,
      addresses: listLanAddresses(),
    };
  });

  app.get('/api/system/info', { preHandler: requirePermission('settings.manage') }, async () => ({
    version: APP_VERSION,
    dataDir: app.paths?.root ?? null,
    node: process.version,
    platform: `${os.type()} ${os.release()}`,
  }));
}
