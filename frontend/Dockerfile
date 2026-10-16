# Build context: repository root (see docker-compose.yml).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY frontend frontend
RUN npx vite build frontend

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
