#!/bin/bash
docker-compose up -d
cd backend && npm run dev &
cd worker && npm run dev &
cd frontend && npm run dev &
wait
