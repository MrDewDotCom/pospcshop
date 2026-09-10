import type { FastifyInstance } from 'fastify';
import {
  docTypeParamSchema,
  ownerShopSettingsSchema,
  staffShopSettingsSchema,
  updateDocumentSequenceInputSchema,
  updateShopSettingsInputSchema,
  type DocumentSequence,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { getSettings, listSequences, updateSequence, updateSettings } from './service';

const settingsSchemas = { owner: ownerShopSettingsSchema, staff: staffShopSettingsSchema };

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const ownerOnly = { preHandler: requirePermission('settings.manage') };

  // Everyone may read the shop details; staff get the narrower schema.
  r.get('/api/settings', async (request) =>
    respondByRole(request, settingsSchemas, getSettings(app.database.db)),
  );

  r.patch(
    '/api/settings',
    { ...ownerOnly, schema: { body: updateShopSettingsInputSchema } },
    async (request) => updateSettings(app.database.db, request.user!, request.body),
  );

  r.get('/api/settings/sequences', ownerOnly, async (): Promise<{ items: DocumentSequence[] }> => ({
    items: listSequences(app.database.db),
  }));

  r.patch(
    '/api/settings/sequences/:docType',
    {
      ...ownerOnly,
      schema: { params: docTypeParamSchema, body: updateDocumentSequenceInputSchema },
    },
    async (request): Promise<DocumentSequence> =>
      updateSequence(app.database.db, request.user!, request.params.docType, request.body),
  );
}
