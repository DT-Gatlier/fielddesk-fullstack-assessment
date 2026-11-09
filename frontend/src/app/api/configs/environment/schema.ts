import { z } from "zod"

export const envSchema = z.object({
  VITE_API_BASE_URL: z.string().default("/api/v1"),
  VITE_API_TIMEOUT: z.coerce.number().default(15000),
  VITE_APP_VERSION: z.string().default("1.0.0"),
})

