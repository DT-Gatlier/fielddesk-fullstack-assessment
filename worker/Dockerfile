FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm install

COPY backend/ backend/
COPY database/migrations /database/migrations

COPY worker/package.json worker/
RUN cd worker && npm install

COPY worker/ worker/

WORKDIR /app/worker

CMD ["npm", "run", "start"]
