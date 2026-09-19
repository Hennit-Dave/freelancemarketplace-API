import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { parse, querySchemas, type Resource } from './validation';
import { ApiError, success } from './responses';

export async function listResource(resource: Resource, input: Record<string, string>) {
  switch (resource) {
    case 'freelancers': {
      const q = parse(querySchemas.freelancers, input);
      const where: Prisma.FreelancerWhereInput = { skills: q.skill ? { has: q.skill } : undefined, rating: q.minRating === undefined ? undefined : { gte: q.minRating } };
      const [data, total] = await prisma.$transaction([
        prisma.freelancer.findMany({ where, take: q.limit, skip: q.offset, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }] }),
        prisma.freelancer.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return success(data, total, q.limit, q.offset);
    }
    case 'clients': {
      const q = parse(querySchemas.clients, input);
      const where: Prisma.ClientWhereInput = { name: q.name ? { contains: q.name, mode: 'insensitive' } : undefined, email: q.email };
      const [data, total] = await prisma.$transaction([
        prisma.client.findMany({ where, take: q.limit, skip: q.offset, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }] }),
        prisma.client.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return success(data, total, q.limit, q.offset);
    }
    case 'gigs': {
      const q = parse(querySchemas.gigs, input);
      const where: Prisma.GigWhereInput = { category: q.category, priceMinor: { gte: q.minPrice, lte: q.maxPrice } };
      const [data, total] = await prisma.$transaction([
        prisma.gig.findMany({ where, take: q.limit, skip: q.offset, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }] }),
        prisma.gig.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return success(data, total, q.limit, q.offset);
    }
    case 'orders': {
      const q = parse(querySchemas.orders, input);
      const where: Prisma.OrderWhereInput = { status: q.status, clientId: q.clientId, gigId: q.gigId };
      const [data, total] = await prisma.$transaction([
        prisma.order.findMany({ where, take: q.limit, skip: q.offset, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }] }),
        prisma.order.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return success(data, total, q.limit, q.offset);
    }
    case 'reviews': {
      const q = parse(querySchemas.reviews, input);
      const where: Prisma.ReviewWhereInput = { orderId: q.orderId, rating: q.rating };
      const [data, total] = await prisma.$transaction([
        prisma.review.findMany({ where, take: q.limit, skip: q.offset, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }] }),
        prisma.review.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return success(data, total, q.limit, q.offset);
    }
  }
}

export async function getResource(resource: Resource, id: string) {
  let data;
  switch (resource) {
    case 'freelancers': data = await prisma.freelancer.findUnique({ where: { id } }); break;
    case 'clients': data = await prisma.client.findUnique({ where: { id } }); break;
    case 'gigs': data = await prisma.gig.findUnique({ where: { id } }); break;
    case 'orders': data = await prisma.order.findUnique({ where: { id } }); break;
    case 'reviews': data = await prisma.review.findUnique({ where: { id } }); break;
  }
  if (!data) throw new ApiError(404, 'NOT_FOUND', `${resource.slice(0, -1)} not found`);
  return success([data]);
}

export async function createOrder(input: { gigId: string; clientId: string }) {
  const order = await prisma.$transaction(async tx => {
    const gig = await tx.gig.findUnique({ where: { id: input.gigId } });
    if (!gig) throw new ApiError(404, 'NOT_FOUND', 'gigId: Gig not found');
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new ApiError(404, 'NOT_FOUND', 'clientId: Client not found');
    return tx.order.create({ data: {
      gigId: gig.id, clientId: client.id,
      priceMinor: gig.priceMinor, currency: gig.currency,
    } });
  });
  return success([order], 1, 1, 0, 201);
}
