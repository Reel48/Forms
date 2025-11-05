# Quote Builder

A modern, customizable quote builder for creating professional quotes with dynamic pricing, client management, and PDF generation.

## Features

- 🎨 Dynamic quote builder with customizable line items
- 💰 Automatic calculations (subtotal, tax, total)
- 👥 Client management system
- 📄 Professional PDF generation
- 📊 Quote management dashboard
- 🔍 Search and filter quotes
- 📱 Responsive design

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: React + TypeScript
- **Database**: Supabase (PostgreSQL)
- **PDF Generation**: ReportLab

## Project Structure

```
Forms/
├── backend/          # FastAPI backend
│   ├── routers/     # API route handlers
│   ├── models.py    # Pydantic models
│   ├── database.py  # Supabase client
│   └── main.py      # FastAPI app entry point
├── frontend/         # React frontend
│   └── src/
│       ├── pages/   # React page components
│       ├── api.ts   # API client
│       └── App.tsx  # Main app component
├── database/         # Database schema
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.9+
- Node.js 18+
- A Supabase account (free tier works)

### 1. Database Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the contents of `database/schema.sql` into the SQL Editor
4. Run the SQL to create all tables, indexes, and policies
5. Go to Project Settings > API
6. Copy your Project URL and anon/public key

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Mac/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env and add your Supabase credentials:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key-here

# Run the server
uvicorn main:app --reload
```

The backend will be available at `http://localhost:8000`
API docs will be available at `http://localhost:8000/docs`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env and set:
# VITE_API_URL=http://localhost:8000

# Run the dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. **Create Clients**: Go to the Clients page and add your clients
2. **Create Quotes**: Click "New Quote" and fill in the form
3. **Add Line Items**: Click "Add Item" to add products/services to your quote
4. **View Quotes**: See all your quotes on the main page
5. **Generate PDF**: Click "Download PDF" on any quote to generate a professional PDF

## Environment Variables

### Backend (.env)
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key
- `DATABASE_URL`: Direct database connection string (optional)

### Frontend (.env)
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)

## Development

### Backend Development
- The backend uses FastAPI with automatic API documentation
- Visit `http://localhost:8000/docs` for interactive API docs
- All routes are prefixed with `/api/`

### Frontend Development
- Uses Vite for fast development
- Hot module replacement enabled
- TypeScript for type safety

## Future Enhancements

- Stripe integration for payments
- Email quote sending
- Quote templates
- Advanced analytics
- Multi-user support with authentication
- Recurring billing setup
- Client portal for viewing quotes

## License

MIT

