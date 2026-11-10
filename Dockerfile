FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm --prefix web ci && DATABASE_URL=postgresql://build:build@localhost/build npm run db:generate && npm run build
EXPOSE 4000
CMD ["npm", "start"]
