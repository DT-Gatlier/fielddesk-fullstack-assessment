import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"

import { getEnvValidationError } from "./app/api/configs/environment/index.ts"
import { queryClient } from "./app/api/configs/tanStackQuery/index.ts"
import AppRouter from "./app/router/index.tsx"
import ConfigError from "./app/shared/pages/ConfigError/index.tsx"

import "./index.css"

const rootElement = document.getElementById("root")!

// Check for environment validation errors before rendering app
if (getEnvValidationError() !== null) {
  const error = getEnvValidationError()
  createRoot(rootElement).render(<ConfigError error={error!} />)
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" richColors />
        <AppRouter />
      </QueryClientProvider>
    </StrictMode>
  )
}
