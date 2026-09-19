# AGENTS.md — Freelance Marketplace API (Task 1)

This file is the single source of truth for this repo. It contains the rules,
the database schema, and the seed script together, so the agent reads all
three as one linked set instead of three separate things to remember.

**Setup instruction for the agent:** extract the two code blocks below into
their own files exactly as written — `prisma/schema.prisma` and
`prisma/seed.ts` — do not redesign or regenerate them. The rules in the
sections above and below those code blocks describe what must be built on
top of that schema.

## Domain
Freelance marketplace. Resources: Freelancers, Clients, Gigs, Orders, Reviews.
The model is fixed in `prisma/schema.prisma` below — do not redesign it.

## Non-negotiable conventions
- All identifiers are generated (UUID or cuid), never sequential integers. Sequential IDs let anyone enumerate the whole dataset by counting.
- Version every path: `/api/v1/...`. Never rename or restructure a v1 path to add a feature — add v2 instead.
- Every successful response uses this exact envelope, no exceptions:
  ```json
  { "data": [...], "meta": { "total": 340, "limit": 20, "offset": 0, "hasMore": true } }
  ```
- Every error response uses this exact envelope:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "Gig not found" } }
  ```
  Never return HTTP 200 with an error described in the body.
  Use `BAD_REQUEST` with HTTP 400 for invalid query parameters, malformed identifiers, or malformed JSON.
  Use `VALIDATION_ERROR` with HTTP 422 for missing or invalid required body fields; name the field in the message.
- Status codes are honest: 400 bad input, 404 not found, 422 missing or invalid required field (name the field in the message), 429 rate limited, never 500 for a malformed identifier.
- Validate every request body and query param with Zod. Validation rules live in the schema, not scattered across handlers.
- Money is always `priceMinor` (integer, minor units) plus a separate `currency` field. Never a decimal or float money field, anywhere.
- `Order.priceMinor` is a snapshot taken at order creation. Never re-derive an order's price by looking up the gig's current price.

## Pagination, filtering, sorting — required on every list endpoint
- `limit` default 20, max 100. A requested limit above 100 is clamped to 100, not rejected.
- A negative `offset` returns 400 with a clear message.
- An unknown `sort` field returns 400. Never silently ignore it and fall back to unsorted.
- Minimum two filterable fields per resource:
  - Gigs: `category`, `minPrice`/`maxPrice`
  - Freelancers: `skill`, `minRating`

## Rate limiting
- Upstash Redis, keyed on IP, 100 requests/minute.
- The limit number lives in a config file, never hardcoded in a handler.
- Over the limit returns 429 with a `Retry-After` header.

## Stack (do not substitute)
- Next.js 14 App Router, TypeScript strict mode
- Prisma + PostgreSQL
- Zod for all request validation
- Upstash Redis for rate limiting
- No authentication on read endpoints — this is a public read API by design

## Traps — actively check for these before considering a task done
- Sequential integer IDs anywhere.
- Returning the full collection when no `limit` query param is supplied.
- Two endpoints with different response shapes.
- HTTP 200 with an error message inside the body.
- Deploying before running the seed script, leaving the live API empty.
- Building or testing the consumer against `localhost` instead of the deployed URL.

## Explicitly out of scope
- No auth beyond identifying which client placed an order.
- No admin panel, no landing page.
- The consumer app is minimal: a list, a filter control, a next-page button. Nothing beyond that.

---

## `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Freelancer {
  id              String   @id @default(cuid())
  name            String
  title           String
  bio             String
  skills          String[]
  hourlyRateMinor Int
  currency        String   @default("USD")
  rating          Float    @default(0)
  createdAt       DateTime @default(now())

  gigs            Gig[]

  @@index([rating])
}

model Client {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())

  orders    Order[]
}

model Gig {
  id           String   @id @default(cuid())
  freelancerId String
  freelancer   Freelancer @relation(fields: [freelancerId], references: [id])
  title        String
  description  String
  category     String
  priceMinor   Int
  currency     String   @default("USD")
  deliveryDays Int
  createdAt    DateTime @default(now())

  orders       Order[]

  @@index([category])
  @@index([priceMinor])
}

enum OrderStatus {
  pending
  in_progress
  delivered
  completed
  cancelled
}

model Order {
  id          String      @id @default(cuid())
  gigId       String
  gig         Gig         @relation(fields: [gigId], references: [id])
  clientId    String
  client      Client      @relation(fields: [clientId], references: [id])
  status      OrderStatus @default(pending)
  priceMinor  Int
  currency    String      @default("USD")
  createdAt   DateTime    @default(now())
  completedAt DateTime?

  review      Review?

  @@index([status])
}

model Review {
  id        String   @id @default(cuid())
  orderId   String   @unique
  order     Order    @relation(fields: [orderId], references: [id])
  rating    Int
  comment   String?
  createdAt DateTime @default(now())
}
```

## `prisma/seed.ts`

```typescript
import { PrismaClient, OrderStatus } from '@prisma/client'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

const CATEGORIES = ['writing', 'design', 'development', 'marketing', 'video']
const SKILLS = ['react', 'figma', 'copywriting', 'seo', 'nextjs', 'branding', 'video-editing']
const STATUSES: OrderStatus[] = ['pending', 'in_progress', 'delivered', 'completed', 'cancelled']

async function main() {
  // Idempotency check: if the table already has data, do nothing.
  // This is what makes "run it twice" safe, per the task's requirement.
  const existing = await prisma.freelancer.count()
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} freelancers already exist.`)
    return
  }

  faker.seed(42) // fixed seed so an empty-table reseed reproduces the same dataset

  const freelancers = await Promise.all(
    Array.from({ length: 150 }).map(() =>
      prisma.freelancer.create({
        data: {
          name: faker.person.fullName(),
          title: faker.person.jobTitle(),
          bio: faker.lorem.paragraph(),
          skills: faker.helpers.arrayElements(SKILLS, { min: 2, max: 5 }),
          hourlyRateMinor: faker.number.int({ min: 1500, max: 15000 }) * 100,
          rating: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
        },
      })
    )
  )

  const clients = await Promise.all(
    Array.from({ length: 200 }).map(() =>
      prisma.client.create({
        data: {
          name: faker.person.fullName(),
          email: faker.internet.email(),
        },
      })
    )
  )

  const gigs = (
    await Promise.all(
      freelancers.flatMap((freelancer) =>
        Array.from({ length: faker.number.int({ min: 1, max: 4 }) }).map(() =>
          prisma.gig.create({
            data: {
              freelancerId: freelancer.id,
              title: faker.commerce.productName(),
              description: faker.lorem.paragraphs(2),
              category: faker.helpers.arrayElement(CATEGORIES),
              priceMinor: faker.number.int({ min: 2000, max: 100000 }),
              deliveryDays: faker.number.int({ min: 1, max: 30 }),
            },
          })
        )
      )
    )
  ).flat()

  let orderCount = 0
  let reviewCount = 0

  for (let i = 0; i < 400; i++) {
    const gig = faker.helpers.arrayElement(gigs)
    const client = faker.helpers.arrayElement(clients)
    const status = faker.helpers.arrayElement(STATUSES)

    const order = await prisma.order.create({
      data: {
        gigId: gig.id,
        clientId: client.id,
        status,
        priceMinor: gig.priceMinor, // snapshot, matches the rule above: never re-derive from the gig later
        completedAt: status === 'completed' ? faker.date.recent() : null,
      },
    })
    orderCount++

    if (status === 'completed' && faker.datatype.boolean({ probability: 0.7 })) {
      await prisma.review.create({
        data: {
          orderId: order.id,
          rating: faker.number.int({ min: 1, max: 5 }),
          comment: faker.lorem.sentence(),
        },
      })
      reviewCount++
    }
  }

  console.log(
    `Seeded ${freelancers.length} freelancers, ${clients.length} clients, ${gigs.length} gigs, ${orderCount} orders, ${reviewCount} reviews.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```
