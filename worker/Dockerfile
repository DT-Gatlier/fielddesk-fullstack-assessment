# Build context: repository root (see docker-compose.yml).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY worker worker
RUN npm run build -w worker

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace worker --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/worker/dist worker/dist
USER node
WORKDIR /app/worker
CMD ["node", "dist/index.js"]
