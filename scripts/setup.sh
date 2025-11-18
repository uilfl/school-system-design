#!/bin/bash

# School SaaS Platform - Setup Script

set -e

echo "🚀 Setting up School SaaS Platform..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Setup backend
echo ""
echo "📦 Setting up backend..."
cd backend

# Copy environment variables
if [ ! -f .env ]; then
    echo "📄 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your configuration"
fi

# Install dependencies
echo "📥 Installing backend dependencies..."
npm install

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

cd ..

echo ""
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis minio

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run migrations
echo ""
echo "🗄️  Running database migrations..."
cd backend
npx prisma migrate dev --name init

# Optional: Load seed data
read -p "Do you want to load seed data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Loading seed data..."
    npm run seed
fi

cd ..

echo ""
echo "✨ Setup completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Update backend/.env with your configuration"
echo "   2. Start the API server:"
echo "      cd backend && npm run dev"
echo "   3. Access the API at http://localhost:3000"
echo "   4. View database with Prisma Studio:"
echo "      cd backend && npx prisma studio"
echo ""
echo "📚 Documentation: ./docs/"
echo "❓ Issues: https://github.com/your-org/school-system-design/issues"
echo ""
echo "Happy coding! 🎉"
