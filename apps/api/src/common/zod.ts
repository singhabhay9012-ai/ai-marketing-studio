import { applyDecorators, BadRequestException, Body, PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Finds the underlying object shape, even through .refine()/.transform(). */
function objectShape(schema: ZodTypeAny): Record<string, unknown> | null {
  let s: ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) s = s._def.schema;
  return s instanceof z.ZodObject ? s.shape : null;
}

/**
 * Equivalent of ValidationPipe({ whitelist, forbidNonWhitelisted, transform })
 * for Zod schemas: unknown keys are rejected, known keys are coerced.
 */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const shape = objectShape(this.schema);
    if (shape && value && typeof value === 'object' && !Array.isArray(value)) {
      const unknown = Object.keys(value).filter((k) => !(k in shape));
      if (unknown.length) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: unknown.map((k) => ({ path: k, message: 'Unknown field' })),
        });
      }
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Validated body + Swagger schema from a single Zod definition. */
export const ZodBody = <T extends ZodTypeAny>(schema: T) => Body(new ZodPipe(schema));

export const ApiZodBody = (schema: ZodTypeAny) =>
  applyDecorators(ApiBody({ schema: (zodToJsonSchema as (s: unknown, o: unknown) => object)(schema, { target: "openApi3" }) }));

/** For PATCH endpoints: make every field optional. */
export function partial<T extends ZodTypeAny>(schema: T): ZodTypeAny {
  let s: ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) s = s._def.schema;
  if (!(s instanceof z.ZodObject)) throw new Error('partial() requires an object schema');
  // Strip defaults so PATCH doesn't overwrite stored values with defaults.
  const shape = Object.fromEntries(
    Object.entries(s.shape as Record<string, ZodTypeAny>).map(([k, v]) => [
      k,
      (v instanceof z.ZodDefault ? v._def.innerType : v).optional(),
    ]),
  );
  return z.object(shape);
}
