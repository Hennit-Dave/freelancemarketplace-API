import { Prisma } from '@prisma/client';
import { ApiError, failure } from './responses';
import { rateLimit } from './rate-limit';
export async function handle(request: Request, action: () => Promise<Response>): Promise<Response> {
  try {
    const limited = await rateLimit(request);
    if (limited) return limited;
    return await action();
  } catch (error) {
    if (error instanceof ApiError) return failure(error.status, error.code, error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma request error:', { code: error.code, message: error.message });
      if (error.code === 'P2025') return failure(404, 'NOT_FOUND', 'Resource not found');
      if (error.code === 'P2003') return failure(422, 'VALIDATION_ERROR', 'gigId or clientId: referenced resource does not exist');
      if (error.code === 'P2002') return failure(409, 'CONFLICT', 'Resource already exists');
    }
    console.error('API request failed', error instanceof Error ? error.name : 'UnknownError');
    return failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
export function unsupported(request: Request) {
  return handle(request, async () => failure(405, 'METHOD_NOT_ALLOWED', 'Method not allowed'));
}
