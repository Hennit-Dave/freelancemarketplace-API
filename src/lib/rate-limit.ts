import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { config } from './config';
import { ApiError, failure } from './responses';
let limiter: Ratelimit | undefined;
const envSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  CLIENT_IP_HEADER: z.string().min(1).default('x-forwarded-for'),
});
export async function rateLimit(request: Request): Promise<Response | undefined> {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    console.error('Rate limiter config invalid:', env.error.issues);
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Rate limiter is not configured');
  }
  limiter ??= new Ratelimit({
    redis: new Redis({ url: env.data.UPSTASH_REDIS_REST_URL, token: env.data.UPSTASH_REDIS_REST_TOKEN }),
    limiter: Ratelimit.slidingWindow(config.rateLimit.requests, config.rateLimit.window),
    prefix: config.rateLimit.prefix,
    timeout: 0,
  });
  const candidate = request.headers.get(env.data.CLIENT_IP_HEADER)?.split(',')[0].trim();
  const ip = z.string().ip().safeParse(candidate);
  // Requests without a valid proxy IP share a conservative bucket.
  try {
    const result = await limiter.limit(ip.success ? ip.data : 'unknown');
    await result.pending;
    if (!result.success) return failure(429, 'RATE_LIMITED', 'Too many requests', {
      'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
    });
  } catch {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Rate limiter is unavailable');
  }
}
