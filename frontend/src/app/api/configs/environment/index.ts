import { envSchema } from "./schema"

let validationError: Error | null = null
let env: Record<string, any> | null = null

try {
  env = envSchema.parse(import.meta.env)
} catch (error) {
  validationError = error instanceof Error ? error : new Error(String(error))
  console.error("Environment validation failed:", validationError)
}

export const ENV = {
  API_BASE_URL: env?.VITE_API_BASE_URL || "/api/v1",
  API_TIMEOUT: env?.VITE_API_TIMEOUT || 15000,
  APP_VERSION: env?.VITE_APP_VERSION || "1.0.0",
} as const

export const getEnvValidationError = () => validationError

