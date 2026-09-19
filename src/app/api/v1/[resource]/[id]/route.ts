import { handle, unsupported } from '@/lib/handler';
import { ApiError } from '@/lib/responses';
import { getResource } from '@/lib/resources';
import { emptyQuerySchema, idSchema, parse, queryInput, resourceSchema } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: { resource: string; id: string } };
export function GET(request: Request, { params }: Context) {
  return handle(request, async () => {
    const resource = resourceSchema.safeParse(params.resource);
    if (!resource.success) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    const id = parse(idSchema, params.id);
    parse(emptyQuerySchema, queryInput(request));
    return getResource(resource.data, id);
  });
}
export const POST = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const OPTIONS = unsupported;
export const HEAD = unsupported;
