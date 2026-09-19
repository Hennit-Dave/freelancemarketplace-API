# Freelance Marketplace API

Next.js 14 App Router, strict TypeScript, PostgreSQL/Prisma, Zod, and Upstash Redis. The Prisma schema and seed are extracted verbatim from `AGENTS.md` and checked by the test suite.

## Setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set DATABASE_URL for application connections, DIRECT_URL for unpooled migration connections, and Upstash REST credentials.
3. Run `npm run db:deploy` to apply the initial migration.
4. Run `npm run db:seed` twice. The second run must report that it skipped existing freelancers.
5. Run `npm run dev` for local API development.

`CLIENT_IP_HEADER` must be supplied by a trusted ingress that overwrites client-supplied values. The default is `x-forwarded-for` (first address). Missing or invalid IPs share a conservative bucket. The rate limiter fails closed with 503 if Redis is unavailable or unconfigured. The configured limit is 100 requests per minute per IP; 429 includes `Retry-After`.

## API

Public `GET /api/v1/{resource}` and `GET /api/v1/{resource}/{id}`:

| Resource | Filters | Sort fields |
| --- | --- | --- |
| freelancers | skill, minRating | createdAt, name, rating, hourlyRateMinor |
| clients | name (contains), email (exact) | createdAt, name |
| gigs | category, minPrice, maxPrice | createdAt, title, priceMinor, deliveryDays |
| orders | status, clientId, gigId | createdAt, priceMinor, status |
| reviews | orderId, rating | createdAt, rating |

Every list accepts `limit` (default 20, capped at 100), `offset` (default 0), `sort` (default createdAt), and `order` (asc or desc, default asc). IDs break sort ties. Unknown parameters, repeated parameters, malformed IDs, negative offsets, and unknown sorts return 400. Price filters use integer minor units. Detail endpoints accept no query parameters.

`POST /api/v1/orders` accepts only `{ "gigId": "<cuid>", "clientId": "<cuid>" }`. It returns 201 and snapshots the gig's priceMinor and currency. Missing/invalid fields return 422 with the field name; malformed JSON returns 400; missing referenced resources return 404. Other write operations are not implemented.

Every successful API response (including details and order creation) has array `data` and `meta: { total, limit, offset, hasMore }`. Errors have `error: { code, message }` and a non-2xx status. No authentication is required. HEAD follows HTTP semantics and has no response body.

## Verification and deployment

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Tests use mocked database/Redis boundaries; they do not prove live service connectivity.

Before publishing a deployment, run `npm run deploy:prepare` with the target database credentials. This applies migrations and runs the unchanged seed. Check its output and confirm the database has records before publishing. The supplied seed skips whenever any freelancer exists; a partially seeded database requires investigation before deployment.

No deployment or consumer app is included in this setup. A future minimal consumer (list, filter control, next-page button) must use the deployed HTTPS API URL, including during consumer testing, never localhost. Local API development is separate from that requirement.

Implementation references: [Next.js 14 route handlers](https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers) and [Upstash rate limiter methods](https://upstash.com/docs/redis/sdks/ratelimit-ts/methods).
