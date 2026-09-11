import { z } from "zod";

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export function parseUuidParam(
  params: Record<string, string>,
  key: string,
): string {
  return z.string().uuid().parse(params[key]);
}
