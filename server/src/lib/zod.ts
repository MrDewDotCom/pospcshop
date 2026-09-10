// Minimal Zod integration for Fastify: route schemas are Zod schemas from @pcshop/shared.
// (We don't use fastify-type-provider-zod because it requires @fastify/swagger as a peer dependency.)

import type { FastifySchemaCompiler, FastifyTypeProvider } from 'fastify';
import type { z, ZodType } from 'zod';
import { RequestValidationError } from './errors';

/** Gives route handlers typed `request.body` / `query` / `params` from their Zod schemas. */
export interface ZodTypeProvider extends FastifyTypeProvider {
  validator: this['schema'] extends ZodType ? z.output<this['schema']> : unknown;
  serializer: this['schema'] extends ZodType ? z.input<this['schema']> : unknown;
}

/** Validates (and transforms, e.g. trims) request data; failures become RequestValidationError. */
export const zodValidatorCompiler: FastifySchemaCompiler<ZodType> =
  ({ schema, httpPart }) =>
  (data) => {
    const result = schema.safeParse(data);
    if (result.success) return { value: result.data };
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return { error: new RequestValidationError(issues, httpPart ?? 'body') };
  };

/** We don't use response schemas for serialization (responses are shaped by respondByRole). */
export const plainJsonSerializerCompiler = () => (data: unknown) => JSON.stringify(data);
