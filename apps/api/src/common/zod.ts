import { applyDecorators, BadRequestException, Body, PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Finds the underlying object schema, even through .transform()/.preprocess().
 * (In Zod 4, .refine() keeps the ZodObject; transforms wrap it in a ZodPipe.)
 */
function objectSchema(schema: z.ZodType): z.ZodObject | null {
  let s: z.ZodType = schema;
  while (s instanceof z.ZodPipe) s = s.in instanceof z.ZodTransform ? (s.out as z.ZodType) : (s.in as z.ZodType);
  return s instanceof z.ZodObject ? s : null;
}

/**
 * Equivalent of ValidationPipe({ whitelist, forbidNonWhitelisted, transform })
 * for Zod schemas: unknown keys are rejected, known keys are coerced.
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const shape = objectSchema(this.schema)?.shape;
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
        errors: result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Validated body + Swagger schema from a single Zod definition. */
export const ZodBody = <T extends z.ZodType>(schema: T) => Body(new ZodPipe(schema));

export const ApiZodBody = (schema: z.ZodType) =>
  applyDecorators(
    ApiBody({
      schema: z.toJSONSchema(schema, {
        target: 'openapi-3.0',
        io: 'input',
        unrepresentable: 'any',
        // ZodPipe rejects unknown keys, so document objects as closed.
        override: ({ zodSchema, jsonSchema }) => {
          if (zodSchema._zod.def.type === 'object') jsonSchema.additionalProperties = false;
        },
      }) as object,
    }),
  );

/** For PATCH endpoints: make every field optional. */
export function partial(schema: z.ZodType): z.ZodObject {
  const s = objectSchema(schema);
  if (!s) throw new Error('partial() requires an object schema');
  // Strip defaults so PATCH doesn't overwrite stored values with defaults.
  const shape = Object.fromEntries(
    Object.entries(s.shape as Record<string, z.ZodType>).map(([k, v]) => [
      k,
      (v instanceof z.ZodDefault ? (v._zod.def.innerType as z.ZodType) : v).optional(),
    ]),
  );
  return z.object(shape);
}
