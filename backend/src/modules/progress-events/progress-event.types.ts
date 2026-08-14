import { Prisma } from "@prisma/client";

export interface CreateProgressEventInput {
  type: string;
  occurredAt?: Date;
  payload: Record<string, unknown>;
}