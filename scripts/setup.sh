#!/bin/bash

# Advanced Download Manager Setup Script (Local Development)

set -e

echo "🚀 Setting up Advanced Download Manager for local development..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    # Check for external tools (optional)
    if ! command -v yt-dlp &> /dev/null; then
        print_warning "yt-dlp is not installed. YouTube downloads won't work."
        echo "Install with: pip install yt-dlp"
    fi

    if ! command -v ffmpeg &> /dev/null; then
        print_warning "ffmpeg is not installed. Video transcoding won't work."
        echo "Install with: apt-get install ffmpeg (Ubuntu) or brew install ffmpeg (Mac)"
    fi

    if ! command -v aria2c &> /dev/null; then
        print_warning "aria2 is not installed. Direct file downloads won't work."
        echo "Install with: apt-get install aria2 (Ubuntu) or brew install aria2 (Mac)"
    fi

    if ! command -v redis-server &> /dev/null; then
        print_warning "Redis is not installed. You'll need it for job queue."
        echo "Install with: apt-get install redis-server (Ubuntu) or brew install redis (Mac)"
    fi

    print_success "Prerequisites check completed"
}

# Setup environment
setup_environment() {
    echo "🔧 Setting up environment..."

    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from example"
        print_warning "Please edit .env file with your local configuration"
    else
        print_warning ".env file already exists"
    fi

    # Create data directories
    mkdir -p data tmp logs
    print_success "Created data directories"
}

# Development setup
setup_development() {
    echo "💻 Setting up development environment..."

    # Backend setup
    if [ -d "backend" ]; then
        echo "📦 Installing backend dependencies..."
        cd backend
        npm install
        npx prisma generate

        # Check if database exists, if not create it
        if [ ! -f "../data/adm.db" ]; then
            echo "🗄️ Creating database..."
            npx prisma migrate dev --name init
        fi

        print_success "Backend dependencies installed"
        cd ..
    fi

    # Frontend setup
    if [ -d "frontend" ]; then
        echo "🎨 Installing frontend dependencies..."
        cd frontend
        npm install
        print_success "Frontend dependencies installed"
        cd ..
    fi

    print_success "Development setup completed"
}

# Start Redis (if available)
start_redis() {
    if command -v redis-server &> /dev/null; then
        echo "🔴 Starting Redis server..."
        if ! pgrep -x "redis-server" > /dev/null; then
            redis-server --daemonize yes
            print_success "Redis server started"
        else
            print_warning "Redis server is already running"
        fi
    else
        print_error "Redis is not installed. Please install Redis first."
    fi
}

# Start aria2 daemon (if available)
start_aria2() {
    if command -v aria2c &> /dev/null; then
        echo "📡 Starting aria2 daemon..."
        if ! pgrep -x "aria2c" > /dev/null; then
            aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=6800 --rpc-secret=dev-secret --daemon
            print_success "aria2 daemon started on port 6800"
        else
            print_warning "aria2 daemon is already running"
        fi
    else
        print_warning "aria2 is not installed. Direct file downloads won't work."
    fi
}

# Stop services
stop_services() {
    echo "🛑 Stopping services..."

    # Stop aria2
    if pgrep -x "aria2c" > /dev/null; then
        pkill aria2c
        print_success "aria2 daemon stopped"
    fi

    # Note: We don't stop Redis as it might be used by other applications
    print_warning "Redis server left running (might be used by other applications)"
}

# Show running instructions
show_instructions() {
    echo ""
    echo "🎯 Development server instructions:"
    echo "=================================="
    echo ""
    echo "1. Start the backend API server:"
    echo "   cd backend && npm run dev"
    echo ""
    echo "2. Start the worker process (in another terminal):"
    echo "   cd backend && npm run worker"
    echo ""
    echo "3. Start the frontend (in another terminal):"
    echo "   cd frontend && npm run dev"
    echo ""
    echo "4. Access the application:"
    echo "   - Frontend: http://localhost:5173"
    echo "   - Backend API: http://localhost:3000"
    echo "   - Health check: http://localhost:3000/health"
    echo ""
    print_warning "Make sure Redis and aria2 are running before starting the backend!"
}

# Main menu
main_menu() {
    echo ""
    echo "📋 What would you like to do?"
    echo "1) Full setup (install dependencies + start services)"
    echo "2) Install dependencies only"
    echo "3) Start external services (Redis + aria2)"
    echo "4) Stop external services"
    echo "5) Show development instructions"
    echo "6) Check service status"
    echo "7) Exit"
    echo ""
    read -p "Enter your choice [1-7]: " choice

    case $choice in
        1)
            setup_development
            start_redis
            start_aria2
            show_instructions
            ;;
        2)
            setup_development
            ;;
        3)
            start_redis
            start_aria2
            print_success "External services started"
            ;;
        4)
            stop_services
            ;;
        5)
            show_instructions
            ;;
        6)
            echo "🔍 Checking service status..."
            echo "Redis: $(pgrep -x "redis-server" > /dev/null && echo "✅ Running" || echo "❌ Not running")"
            echo "aria2: $(pgrep -x "aria2c" > /dev/null && echo "✅ Running" || echo "❌ Not running")"
            ;;
        7)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            main_menu
            ;;
    esac
}

# Main execution
main() {
    echo "🎯 Advanced Download Manager Local Setup"
    echo "========================================"

    check_prerequisites
    setup_environment
    main_menu
}

# Run main function
main "$@"