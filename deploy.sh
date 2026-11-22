#!/usr/bin/env bash
set -e

echo "=================================================="
echo "    Meeting Transcriber Deployment Script"
echo "=================================================="

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed."
    echo "Please install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed."
    echo "Please install Docker Compose plugin: https://docs.docker.com/compose/install/"
    exit 1
fi

# Ensure .env file exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "⚠️ .env not found. Copying .env.example to .env..."
        cp .env.example .env
        echo "Please edit .env to add your PYANNOTE_AUTH_TOKEN if needed."
    else
        echo "❌ Error: .env file missing. Please create one before deploying."
        exit 1
    fi
fi

# Ensure storage directories exist
mkdir -p storage/uploads storage/audio

echo "🚀 Building and starting containers..."
docker compose build --parallel
docker compose up -d

echo ""
echo "=================================================="
echo "✅ Deployment successful!"
echo "=================================================="
echo "Services are now running:"
echo "  • Frontend:  http://localhost:3000"
echo "  • Backend:   http://localhost:8000"
echo "  • API Docs:  http://localhost:8000/docs"
echo ""
echo "Useful commands:"
echo "  • View logs:    docker compose logs -f"
echo "  • Stop:         docker compose down"
echo "  • Restart:      docker compose restart"
echo "=================================================="
