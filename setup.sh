#!/bin/bash
set -e

echo "Starting setup..."

if [ ! -f .env ]; then
    echo "Creating .env from .env.example"
    cp .env.example .env
fi

echo "Starting services..."
docker-compose up -d --build

echo "Waiting for database to be ready..."
sleep 5

echo "Running migrations..."
docker-compose exec -T backend alembic upgrade head

echo "Seeding database..."
docker-compose exec -T backend python -m app.seed

echo "Setup complete!"
