#!/bin/bash

# Quick Start Script for Quote Builder
# This script helps you get started quickly

echo "🚀 Quote Builder - Quick Start"
echo "================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9+ first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Python and Node.js are installed"
echo ""

# Setup backend
echo "📦 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt > /dev/null 2>&1

if [ ! -f ".env" ]; then
    echo "⚠️  Please create a .env file with your Supabase credentials:"
    echo "   SUPABASE_URL=https://your-project.supabase.co"
    echo "   SUPABASE_KEY=your-anon-key-here"
    echo ""
    echo "   Copy .env.example to .env and edit it"
fi

cd ..

# Setup frontend
echo "📦 Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install > /dev/null 2>&1
fi

if [ ! -f ".env" ]; then
    echo "⚠️  Please create a .env file:"
    echo "   VITE_API_URL=http://localhost:8000"
    echo ""
    echo "   Copy .env.example to .env"
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set up your Supabase database (see database/README.md)"
echo "2. Configure your .env files with credentials"
echo "3. Start the backend: cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "4. Start the frontend: cd frontend && npm run dev"
echo ""
echo "🌐 Backend will run on http://localhost:8000"
echo "🌐 Frontend will run on http://localhost:5173"
echo ""

