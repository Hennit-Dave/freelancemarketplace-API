import { handle } from '@/lib/handler';
import { failure } from '@/lib/responses';
export const dynamic = 'force-dynamic';
function notFound(request: Request) {
  return handle(request, async () => failure(404, 'NOT_FOUND', 'API route not found'));
}
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE, notFound as OPTIONS, notFound as HEAD };
