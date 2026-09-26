import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, mock } from 'node:test';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { createOrder, listResource } from '../src/lib/resources';
import { ApiError, success } from '../src/lib/responses';
import { idSchema, parse, parseOrderBody, queryInput, querySchemas, resourceSchema } from '../src/lib/validation';

const gigId = 'clxxxxxxxxxxxxxxxxxxxxxxx';
const clientId = 'clyyyyyyyyyyyyyyyyyyyyyyy';
function replaceMethod<T extends (...args: never[]) => unknown>(target: object, key: string, implementation: T) {
  const original = Reflect.get(target, key);
  const replacement = mock.fn(implementation);
  Reflect.set(target, key, replacement);
  return { calls: replacement.mock.calls, restore: () => Reflect.set(target, key, original), replacement };
}
test('Prisma source files match AGENTS.md byte for byte', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  for (const [file, language] of [['schema.prisma', 'prisma'], ['seed.ts', 'typescript']]) {
    const section = instructions.split('## `prisma/' + file + '`')[1];
    const content = section.split('```' + language + '\n')[1].split('```')[0];
    assert.equal(readFileSync('prisma/' + file, 'utf8'), content);
  }
});
test('all lists enforce pagination and reject invalid sort, offset and unknown query fields', () => {
  for (const resource of resourceSchema.options) {
    const schema = querySchemas[resource];
    assert.equal(parse(schema, {}).limit, 20);
    assert.equal(parse(schema, { limit: '101' }).limit, 100);
    for (const input of [{ offset: '-1' }, { sort: 'invalid' }, { surprise: 'yes' }, { limit: '0' }, { limit: '1.5' }, { offset: '' }]) {
      assert.throws(() => parse(schema, input), (e: unknown) => e instanceof ApiError && e.status === 400);
    }
  }
  assert.throws(() => parse(querySchemas.gigs, { minPrice: '200', maxPrice: '100' }), /maxPrice/);
  assert.throws(() => parse(idSchema, '1'), (e: unknown) => e instanceof ApiError && e.status === 400);
  assert.throws(() => queryInput(new Request('https://example.com/api/v1/gigs?limit=1&limit=2')), /duplicate/);
});
test('invalid JSON is 400; missing required body field is 422 and names the field', async () => {
  await assert.rejects(parseOrderBody(new Request('https://example.com', { method: 'POST', body: '{' })), (e: unknown) => e instanceof ApiError && e.status === 400);
  await assert.rejects(parseOrderBody(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ gigId }) })), (e: unknown) => e instanceof ApiError && e.status === 422 && e.message.includes('clientId'));
});
test('success uses array data and exact pagination envelope', async () => {
  assert.deepEqual(await success([{ id: gigId }], 2, 1, 0).json(), {
    data: [{ id: gigId }], meta: { total: 2, limit: 1, offset: 0, hasMore: true },
  });
});
test('list sends bounded pagination and filters to Prisma and uses filtered count', async () => {
  const find = replaceMethod(prisma.gig, 'findMany', (_args: Prisma.GigFindManyArgs) => Promise.resolve([{ id: gigId }]));
  const count = replaceMethod(prisma.gig, 'count', (_args: Prisma.GigCountArgs) => Promise.resolve(25));
  const transaction = replaceMethod(prisma, '$transaction', async (operations: Promise<unknown>[]) => Promise.all(operations));
  try {
    const response = await listResource('gigs', { category: 'design', minPrice: '100' });
    const findArgs = find.replacement.mock.calls[0].arguments[0];
    const countArgs = count.replacement.mock.calls[0].arguments[0];
    assert.ok(findArgs?.where);
    assert.ok(countArgs);
    assert.equal(findArgs.take, 20);
    assert.equal(findArgs.where.category, 'design');
    assert.deepEqual(countArgs.where, findArgs.where);
    assert.deepEqual((await response.json()).meta, { total: 25, limit: 20, offset: 0, hasMore: true });
  } finally { find.restore(); count.restore(); transaction.restore(); }
});
test('order creation snapshots price and currency from the gig', async () => {
  let stored: Record<string, unknown> | undefined;
  const gig = { id: gigId, priceMinor: 4500, currency: 'EUR' };
  const transaction = replaceMethod(prisma, '$transaction', async (callback: (tx: unknown) => unknown) => callback({
    gig: { findUnique: async () => gig },
    client: { findUnique: async () => ({ id: clientId }) },
    order: { create: async ({ data }: { data: Record<string, unknown> }) => { stored = { ...data }; return { id: 'clzzzzzzzzzzzzzzzzzzzzzzz', ...stored }; } },
  }));
  try {
    const response = await createOrder({ gigId, clientId });
    gig.priceMinor = 9900;
    assert.equal(response.status, 201);
    assert.equal(stored?.priceMinor, 4500);
    assert.equal(stored?.currency, 'EUR');
    assert.equal((await response.json()).data[0].priceMinor, 4500);
  } finally { transaction.restore(); }
});
test('rate limiter fails closed when configuration is missing', async () => {
  const { handle } = await import('../src/lib/handler');
  const original = { ...process.env };
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  try {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const missing = await handle(new Request('https://example.com'), async () => success([]));
    assert.equal(missing.status, 503);
    assert.deepEqual(Object.keys(await missing.json()), ['error']);
  } finally {
    process.env = original;
  }
});
async function listGigs(input: Record<string, string>, rows: unknown[], total: number) {
  const find = replaceMethod(prisma.gig, 'findMany', (_args: Prisma.GigFindManyArgs) => Promise.resolve(rows));
  const count = replaceMethod(prisma.gig, 'count', (_args: Prisma.GigCountArgs) => Promise.resolve(total));
  const transaction = replaceMethod(prisma, '$transaction', async (operations: Promise<unknown>[]) => Promise.all(operations));
  try {
    const response = await listResource('gigs', input);
    return {
      body: await response.json(),
      findWhere: find.replacement.mock.calls[0].arguments[0]?.where,
      countWhere: count.replacement.mock.calls[0].arguments[0]?.where,
    };
  } finally { find.restore(); count.restore(); transaction.restore(); }
}
const searchClause = (term: string) => [
  { title: { contains: term, mode: 'insensitive' } },
  { description: { contains: term, mode: 'insensitive' } },
];
test('gig search trims the term and matches title or description case-insensitively', async () => {
  const { body, findWhere, countWhere } = await listGigs({ search: '  Logo  ' }, [{ id: gigId, title: 'Minimal logo design' }], 1);
  assert.deepEqual(findWhere?.OR, searchClause('Logo'));
  assert.deepEqual(countWhere, findWhere);
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.meta, { total: 1, limit: 20, offset: 0, hasMore: false });
});
test('gig search with no matches returns an empty page, not an error', async () => {
  const { body, findWhere } = await listGigs({ search: 'zzz-no-such-gig' }, [], 0);
  assert.deepEqual(findWhere?.OR, searchClause('zzz-no-such-gig'));
  assert.deepEqual(body, { data: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } });
});
test('gig search combines with existing filters using AND', async () => {
  const { findWhere, countWhere } = await listGigs({ search: 'logo', category: 'design', minPrice: '1000', maxPrice: '5000' }, [{ id: gigId }], 1);
  assert.equal(findWhere?.category, 'design');
  assert.deepEqual(findWhere?.priceMinor, { gte: 1000, lte: 5000 });
  assert.deepEqual(findWhere?.OR, searchClause('logo'));
  assert.equal(findWhere?.AND, undefined);
  assert.deepEqual(countWhere, findWhere);
});
test('gig search over 100 characters after trimming is rejected with 400 BAD_REQUEST', async () => {
  const limit = 'a'.repeat(100);
  assert.equal(parse(querySchemas.gigs, { search: `  ${limit}  ` }).search, limit);
  for (const search of [`${limit}a`, `  ${limit}a  `]) {
    assert.throws(() => parse(querySchemas.gigs, { search }), (e: unknown) => e instanceof ApiError && e.status === 400 && e.code === 'BAD_REQUEST' && e.message.startsWith('search:'));
    await assert.rejects(listResource('gigs', { search }), (e: unknown) => e instanceof ApiError && e.status === 400);
  }
});
test('gig search that is empty or whitespace-only is rejected with 400 BAD_REQUEST', async () => {
  for (const search of ['', '   ']) {
    assert.throws(() => parse(querySchemas.gigs, { search }), (e: unknown) => e instanceof ApiError && e.status === 400 && e.code === 'BAD_REQUEST' && e.message.startsWith('search:'));
    await assert.rejects(listResource('gigs', { search }), (e: unknown) => e instanceof ApiError && e.status === 400 && e.code === 'BAD_REQUEST');
  }
});
test('gig search escapes LIKE wildcards so they match literally', async () => {
  const { findWhere, countWhere } = await listGigs({ search: '100%' }, [], 0);
  assert.deepEqual(findWhere?.OR, searchClause('100\\%'));
  assert.deepEqual(countWhere, findWhere);
  const { findWhere: mixed } = await listGigs({ search: 'a_b\\c' }, [], 0);
  assert.deepEqual(mixed?.OR, searchClause('a\\_b\\\\c'));
});
