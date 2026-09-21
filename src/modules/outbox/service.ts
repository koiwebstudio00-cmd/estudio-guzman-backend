import type { Prisma } from "../../generated/prisma/client.js";

interface OutboxMessage {
  type: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
  dedupeKey?: string;
}

export class OutboxService {
  publish(transaction: Prisma.TransactionClient, message: OutboxMessage) {
    return transaction.outboxEvent.create({
      data: {
        type: message.type,
        payload: message.payload,
        ...(message.aggregateType ? { aggregateType: message.aggregateType } : {}),
        ...(message.aggregateId ? { aggregateId: message.aggregateId } : {}),
        ...(message.availableAt ? { availableAt: message.availableAt } : {}),
        ...(message.dedupeKey ? { dedupeKey: message.dedupeKey } : {})
      }
    });
  }
}

export const outboxService = new OutboxService();
