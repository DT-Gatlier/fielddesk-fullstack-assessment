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
COPY backend backend
RUN npm run build -w backend

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY database/migrations database/migrations
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
