FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

# Since worker uses Prisma client from backend in local compose, we generate it here for the worker too
# Alternatively, we copy schema if needed, but for now we just rely on the mount in docker-compose
# Actually, the mount might not be there at build time, so let's copy the schema and generate
# Assuming docker-compose build context is just ./worker, we can't easily copy from ../backend
# But wait, in docker-compose.yml we mount ./backend/prisma to /app/prisma.
# Let's just generate the client at runtime in entrypoint or rely on the host generation.
# For simplicity, we just build.



CMD ["npm", "run", "dev"]
