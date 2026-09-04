Write-Host "Starting setup..."

if (!(Test-Path .env)) {
    Write-Host "Creating .env from .env.example"
    Copy-Item .env.example .env
}

Write-Host "Starting services..."
docker-compose up -d --build

Write-Host "Waiting for database to be ready..."
Start-Sleep -Seconds 5

Write-Host "Running migrations..."
docker-compose exec backend alembic upgrade head

Write-Host "Seeding database..."
docker-compose exec backend python -m app.seed

Write-Host "Setup complete!"
