FROM node:20-alpine

WORKDIR /app/worker

COPY worker/package.json ./
RUN npm install

COPY worker/ ./

CMD ["npm", "run", "dev"]
