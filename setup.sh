#!/bin/bash

# LanCall Setup Script
# This script helps you set up the LanCall application quickly

set -e

echo "🚀 LanCall Setup Script"
echo "======================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Create certs directory if it doesn't exist
if [ ! -d "certs" ]; then
    echo "📁 Creating certs directory..."
    mkdir -p certs
fi

# Check if certificates exist
if [ ! -f "certs/cert.pem" ] || [ ! -f "certs/key.pem" ]; then
    echo "🔐 TLS certificates not found. Generating self-signed certificates..."
    
    # Generate self-signed certificate
    openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0"
    
    echo "✅ Self-signed certificates generated"
    echo "⚠️  Note: You'll need to accept the certificate warning in your browser"
else
    echo "✅ TLS certificates found"
fi

# Ask user which mode to run
echo ""
echo "Choose deployment mode:"
echo "1) Production mode (recommended)"
echo "2) Development mode (with hot reload and MongoDB admin UI)"
read -p "Enter your choice (1 or 2): " mode

case $mode in
    1)
        echo "🏭 Starting in production mode..."
        docker-compose up -d
        ;;
    2)
        echo "🛠️  Starting in development mode..."
        docker-compose -f docker-compose.dev.yml up -d
        echo "📊 MongoDB Admin UI will be available at: http://localhost:8081"
        echo "   Username: admin, Password: admin123"
        ;;
    *)
        echo "❌ Invalid choice. Defaulting to production mode..."
        docker-compose up -d
        ;;
esac

echo ""
echo "🎉 LanCall is starting up!"
echo "⏳ Please wait a moment for all services to be ready..."

# Wait for services to be ready
sleep 10

echo ""
echo "🌐 Application URLs:"
echo "   Main App: https://localhost:3000"
echo "   API Health: https://localhost:3000/api/rooms"

if [ "$mode" = "2" ]; then
    echo "   MongoDB Admin: http://localhost:8081"
fi

echo ""
echo "📝 Quick commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop app: docker-compose down"
echo "   Restart: docker-compose restart"

echo ""
echo "⚠️  Important notes:"
echo "   - You'll need to accept the self-signed certificate in your browser"
echo "   - For production, use real TLS certificates"
echo "   - The application requires HTTPS for camera/microphone access"

echo ""
echo "✅ Setup complete! Enjoy using LanCall! 🎥"
