FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package.json ./
RUN npm install

COPY backend/ ./
COPY database/migrations /database/migrations

RUN chmod +x docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
