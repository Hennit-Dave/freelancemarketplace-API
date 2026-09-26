import { z } from 'zod';
import { config } from './config';
import { ApiError } from './responses';

export const resourceSchema = z.enum(['freelancers', 'clients', 'gigs', 'orders', 'reviews']);
export type Resource = z.infer<typeof resourceSchema>;
export const idSchema = z.string().cuid('id must be a valid cuid');
const integer = z.string().regex(/^\d+$/, 'must be a non-negative integer').transform(Number).pipe(z.number().int().safe());
const text = z.string().trim().min(1).max(200);
const pagination = {
  limit: integer.pipe(z.number().positive()).default(String(config.pagination.defaultLimit)).transform(n => Math.min(n, config.pagination.maxLimit)),
  offset: integer.pipe(z.number().max(2147483647)).default('0'),
  order: z.enum(['asc', 'desc']).default('asc'),
};
export const querySchemas = {
  freelancers: z.object({ ...pagination, sort: z.enum(['createdAt', 'name', 'rating', 'hourlyRateMinor']).default('createdAt'), skill: text.optional(), minRating: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().min(0).max(5)).optional() }).strict(),
  clients: z.object({ ...pagination, sort: z.enum(['createdAt', 'name']).default('createdAt'), name: text.optional(), email: z.string().email().optional() }).strict(),
  gigs: z.object({ ...pagination, sort: z.enum(['createdAt', 'title', 'priceMinor', 'deliveryDays']).default('createdAt'), category: text.optional(), search: z.string().trim().min(1).max(100).optional(), minPrice: integer.pipe(z.number().max(2147483647)).optional(), maxPrice: integer.pipe(z.number().max(2147483647)).optional() }).strict().refine(q => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, { path: ['maxPrice'], message: 'maxPrice must be greater than or equal to minPrice' }),
  orders: z.object({ ...pagination, sort: z.enum(['createdAt', 'priceMinor', 'status']).default('createdAt'), status: z.enum(['pending', 'in_progress', 'delivered', 'completed', 'cancelled']).optional(), clientId: idSchema.optional(), gigId: idSchema.optional() }).strict(),
  reviews: z.object({ ...pagination, sort: z.enum(['createdAt', 'rating']).default('createdAt'), orderId: idSchema.optional(), rating: integer.pipe(z.number().min(1).max(5)).optional() }).strict(),
};
export const orderBodySchema = z.object({ gigId: idSchema, clientId: idSchema }).strict();
export const emptyQuerySchema = z.object({}).strict();
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown, status = 400): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
    throw new ApiError(status, status === 422 ? 'VALIDATION_ERROR' : 'BAD_REQUEST', message);
  }
  return result.data;
}
export function queryInput(request: Request) {
  const result: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key)) throw new ApiError(400, 'BAD_REQUEST', `${key}: duplicate query parameter`);
    result[key] = value;
  }
  return result;
}
export async function parseOrderBody(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new ApiError(400, 'BAD_REQUEST', 'body: must be valid JSON'); }
  return parse(orderBodySchema, body, 422);
}
