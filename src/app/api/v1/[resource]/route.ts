import { handle, unsupported } from '@/lib/handler';
import { ApiError } from '@/lib/responses';
import { createOrder, listResource } from '@/lib/resources';
import { emptyQuerySchema, parse, parseOrderBody, queryInput, resourceSchema } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: { resource: string } };
function resource(value: string) {
  const result = resourceSchema.safeParse(value);
  if (!result.success) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return result.data;
}
export function GET(request: Request, { params }: Context) {
  return handle(request, async () => listResource(resource(params.resource), queryInput(request)));
}
export function POST(request: Request, { params }: Context) {
  return handle(request, async () => {
    if (resource(params.resource) !== 'orders') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    parse(emptyQuerySchema, queryInput(request));
    return createOrder(await parseOrderBody(request));
  });
}
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const OPTIONS = unsupported;
export const HEAD = unsupported;
