import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In docker the API is reachable as http://backend:8000. Outside docker set VITE_PROXY_TARGET=http://localhost:8000
const target = process.env.VITE_PROXY_TARGET || "http://backend:8000";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, proxy: { "/api": { target, changeOrigin: true } } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.js" },
});
