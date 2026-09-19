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
