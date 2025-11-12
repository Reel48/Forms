# Forms & Quotes Builder

A comprehensive, full-stack business application for creating and managing quotes, forms, and client relationships. Built with modern technologies and designed for scalability, security, and ease of use.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Authentication & Authorization](#authentication--authorization)
- [Security Features](#security-features)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

Forms & Quotes Builder is a professional business management platform that enables companies to:

- **Create and manage quotes** with dynamic pricing, line items, and professional PDF generation
- **Build custom forms** with 15+ field types, conditional logic, and public submission capabilities
- **Manage client relationships** with comprehensive client profiles and assignment workflows
- **Process payments** through Stripe integration for invoices and quote acceptance
- **Track analytics** with detailed quote and form submission metrics
- **Secure access** with role-based authentication (Admin and Customer roles)

The application is designed for businesses that need to create professional quotes, collect form submissions, manage client relationships, and process payments—all in one integrated platform.

---

## ✨ Features

### Quote Management
- ✅ **Dynamic Quote Builder**: Create quotes with customizable line items, quantities, discounts, and tax rates
- ✅ **Automatic Calculations**: Real-time subtotal, tax, and total calculations
- ✅ **Quote Status Tracking**: Draft, Sent, Accepted, Declined, Expired statuses
- ✅ **Professional PDF Generation**: Download quotes as professionally formatted PDFs
- ✅ **Quote Analytics**: View quote statistics, conversion rates, and revenue metrics
- ✅ **Client Assignment**: Assign quotes to specific customers for viewing and acceptance
- ✅ **Expiration Dates**: Set and track quote expiration dates
- ✅ **Multi-Currency Support**: Support for different currencies (USD default)

### Form Builder
- ✅ **15+ Field Types**: Short Text, Long Text, Email, Number, Phone, URL, Date, Time, Date & Time, Dropdown, Multiple Choice, Checkboxes, Yes/No, Rating (Stars), Opinion Scale
- ✅ **Drag-and-Drop Reordering**: Intuitive field ordering with visual drag-and-drop
- ✅ **Conditional Logic**: Show/hide fields based on other field values
- ✅ **Form Status Management**: Draft, Published, Archived statuses
- ✅ **Welcome & Thank You Screens**: Customizable welcome and completion screens
- ✅ **Public Form Access**: Shareable public URLs with unique slugs
- ✅ **Form Submissions**: View and manage all form submissions with answer details
- ✅ **Field Validation**: Required fields, email validation, number validation, and more

### Client Management
- ✅ **Comprehensive Client Profiles**: Name, email, company, phone, address, notes
- ✅ **Stripe Customer Integration**: Automatic Stripe customer creation when clients are added
- ✅ **Client-User Linking**: Link client records to user accounts
- ✅ **Client Assignment**: Assign quotes and forms to specific clients
- ✅ **Search and Filter**: Find clients quickly with search functionality

### Authentication & User Management
- ✅ **User Registration**: Self-service user registration with email verification
- ✅ **Secure Login**: JWT-based authentication with Supabase
- ✅ **Password Reset**: Secure password reset flow with email notifications
- ✅ **Email Verification**: Email verification for new user accounts
- ✅ **Role-Based Access Control**: Admin and Customer roles with different permissions
- ✅ **Session Management**: View and manage active sessions across devices
- ✅ **Login Activity Tracking**: Monitor login attempts and security events
- ✅ **Token Revocation**: Revoke tokens on logout and manage active sessions
- ✅ **Password History**: Prevent password reuse (last 5 passwords)

### Payment Processing (Stripe)
- ✅ **Stripe Integration**: Full Stripe payment processing integration
- ✅ **Invoice Creation**: Convert accepted quotes to Stripe invoices
- ✅ **Payment Tracking**: Automatic payment status updates via webhooks
- ✅ **Hosted Invoice Pages**: Stripe-hosted payment pages for customers
- ✅ **Payment Status**: Track unpaid, paid, partially paid, refunded, and failed payments
- ✅ **Customer Sync**: Automatic Stripe customer creation for clients

### Company Settings
- ✅ **Company Profile**: Manage company name, address, contact information
- ✅ **Branding**: Customize company logo and branding elements
- ✅ **Email Settings**: Configure email sender information
- ✅ **Tax Settings**: Set default tax rates and currency

### Email Notifications
- ✅ **Password Reset Emails**: Secure password reset links via email
- ✅ **Assignment Notifications**: Email notifications when quotes/forms are assigned
- ✅ **AWS SES Integration**: Production-ready email service via AWS SES
- ✅ **Email Templates**: Professional HTML email templates

### Security Features
- ✅ **Rate Limiting**: API rate limiting to prevent abuse
- ✅ **Account Lockout**: Temporary account lockout after failed login attempts
- ✅ **CORS Protection**: Configurable CORS settings for API security
- ✅ **Row Level Security (RLS)**: Database-level security policies
- ✅ **Token Revocation**: Secure token blacklisting system
- ✅ **Password History**: Prevent password reuse
- ✅ **Session Management**: Track and revoke active sessions
- ✅ **Login Activity Monitoring**: Security event logging

### Analytics & Reporting
- ✅ **Quote Analytics**: View quote statistics, conversion rates, revenue metrics
- ✅ **Form Submission Tracking**: Track form submissions and completion rates
- ✅ **Client Activity**: Monitor client engagement and interactions

### User Experience
- ✅ **Responsive Design**: Mobile-friendly interface that works on all devices
- ✅ **Modern UI**: Clean, professional interface built with React and Framer Motion
- ✅ **Real-time Updates**: Live updates for quotes, forms, and assignments
- ✅ **Search & Filter**: Quick search and filtering across all data
- ✅ **Notification System**: User-friendly notifications for actions and errors
- ✅ **Session Timeout Warning**: Warns users before session expiration

---

## 🛠 Tech Stack

### Frontend
- **Framework**: React 19.1.1 with TypeScript
- **Build Tool**: Vite 7.1.7
- **Routing**: React Router DOM 7.9.5
- **UI/Animations**: Framer Motion 12.23.24
- **Drag & Drop**: @dnd-kit/core, @dnd-kit/sortable
- **HTTP Client**: Axios 1.13.2
- **Authentication**: @supabase/supabase-js 2.80.0
- **Payments**: @stripe/react-stripe-js, @stripe/stripe-js

### Backend
- **Framework**: FastAPI 0.104.1
- **Server**: Uvicorn 0.24.0
- **Database Client**: Supabase Python Client 2.0.0
- **PDF Generation**: ReportLab 4.0.7
- **Payment Processing**: Stripe 7.0.0
- **Email Service**: AWS SES (via boto3 1.34.0)
- **Authentication**: python-jose[cryptography] 3.3.0
- **Rate Limiting**: slowapi 0.1.9
- **Validation**: Pydantic 2.5.0

### Database
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Supabase Client (direct SQL queries)
- **Migrations**: SQL migration files
- **Security**: Row Level Security (RLS) policies

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: AWS App Runner
- **Database Hosting**: Supabase
- **Email Service**: AWS SES
- **Payment Processing**: Stripe
- **Container Registry**: AWS ECR (Elastic Container Registry)

### Development Tools
- **TypeScript**: 5.9.3
- **ESLint**: 9.36.0
- **Python**: 3.9+
- **Node.js**: 18+

---

## 🏗 Architecture

### System Architecture

```
┌─────────────────┐
│   Frontend      │  React + TypeScript (Vercel)
│   (Vercel)      │
└────────┬────────┘
         │ HTTPS
         │
┌────────▼────────┐
│   Backend API   │  FastAPI (AWS App Runner)
│   (AWS)         │
└────────┬────────┘
         │
    ┌────┴────┬──────────────┬─────────────┐
    │         │              │             │
┌───▼───┐ ┌──▼────┐  ┌──────▼──────┐ ┌───▼────┐
│Supabase│ │ Stripe│  │  AWS SES    │ │  ECR    │
│(Postgres)│ │(Payments)│  │  (Email)    │ │(Docker)│
└────────┘ └───────┘  └─────────────┘ └────────┘
```

### Authentication Flow

1. User registers/logs in via frontend
2. Frontend authenticates with Supabase Auth
3. Supabase returns JWT token
4. Frontend stores token and includes in API requests
5. Backend validates JWT token on each request
6. Backend checks user role and permissions
7. Backend enforces Row Level Security (RLS) policies

### Data Flow

1. **Quote Creation**:
   - Admin creates quote via frontend
   - Frontend sends request to backend API
   - Backend validates and stores in Supabase
   - RLS policies ensure data isolation
   - Admin can assign quote to customers

2. **Form Submission**:
   - Customer accesses public form URL
   - Customer fills out form
   - Frontend submits to backend API
   - Backend validates and stores submission
   - Admin can view submissions

3. **Payment Processing**:
   - Customer accepts quote
   - Admin creates Stripe invoice
   - Customer pays via Stripe
   - Stripe webhook updates payment status
   - Backend updates quote payment status

---

## 📁 Project Structure

```
Forms/
├── backend/                    # FastAPI backend application
│   ├── routers/               # API route handlers
│   │   ├── auth.py           # Authentication endpoints
│   │   ├── quotes.py         # Quote management endpoints
│   │   ├── forms.py          # Form management endpoints
│   │   ├── clients.py        # Client management endpoints
│   │   ├── stripe.py         # Stripe payment endpoints
│   │   ├── company_settings.py  # Company settings endpoints
│   │   ├── assignments.py    # Assignment management endpoints
│   │   ├── pdf.py            # PDF generation endpoints
│   │   └── email_debug.py    # Email debugging endpoints
│   ├── auth.py               # Authentication utilities
│   ├── database.py           # Supabase client configuration
│   ├── models.py             # Pydantic models for request/response
│   ├── main.py               # FastAPI application entry point
│   ├── stripe_service.py     # Stripe API service layer
│   ├── email_service_ses.py  # AWS SES email service
│   ├── email_service.py      # Email service interface
│   ├── password_utils.py      # Password validation utilities
│   ├── password_history_utils.py  # Password history management
│   ├── token_utils.py        # JWT token utilities
│   ├── rate_limiter.py       # API rate limiting
│   ├── account_lockout.py    # Account lockout logic
│   ├── requirements.txt      # Python dependencies
│   ├── Dockerfile            # Docker configuration for AWS
│   ├── apprunner.yaml        # AWS App Runner configuration
│   └── deploy-to-aws.sh      # AWS deployment script
│
├── frontend/                  # React frontend application
│   ├── src/
│   │   ├── pages/            # React page components
│   │   │   ├── Login.tsx    # Login page
│   │   │   ├── Register.tsx  # Registration page
│   │   │   ├── QuotesList.tsx  # Quotes list page
│   │   │   ├── QuoteBuilder.tsx  # Quote creation/editing
│   │   │   ├── QuoteView.tsx     # Quote detail view
│   │   │   ├── FormsList.tsx     # Forms list page
│   │   │   ├── FormBuilder.tsx   # Form creation/editing
│   │   │   ├── FormView.tsx      # Form detail view
│   │   │   ├── PublicFormView.tsx # Public form submission
│   │   │   ├── FormSubmissions.tsx  # Form submissions view
│   │   │   ├── ClientsList.tsx   # Clients list page
│   │   │   ├── CompanySettings.tsx  # Company settings page
│   │   │   ├── Profile.tsx       # User profile page
│   │   │   ├── CustomerDashboard.tsx  # Customer dashboard
│   │   │   ├── QuoteAnalytics.tsx     # Analytics page
│   │   │   ├── ForgotPassword.tsx     # Password reset request
│   │   │   ├── ResetPassword.tsx      # Password reset confirmation
│   │   │   ├── VerifyEmail.tsx        # Email verification
│   │   │   └── ResendVerification.tsx # Resend verification email
│   │   ├── components/       # Reusable React components
│   │   │   ├── ProtectedRoute.tsx  # Route protection component
│   │   │   ├── SessionTimeoutWarning.tsx  # Session warning
│   │   │   └── NotificationSystem.tsx     # Notification system
│   │   ├── contexts/         # React contexts
│   │   │   └── AuthContext.tsx  # Authentication context
│   │   ├── lib/              # Library configurations
│   │   │   └── supabase.ts  # Supabase client configuration
│   │   ├── utils/            # Utility functions
│   │   │   ├── passwordValidation.ts  # Password validation
│   │   │   └── textUtils.ts           # Text utilities
│   │   ├── api.ts            # API client functions
│   │   ├── App.tsx           # Main app component
│   │   └── main.tsx          # Application entry point
│   ├── package.json          # Node.js dependencies
│   ├── vite.config.ts        # Vite configuration
│   ├── tsconfig.json         # TypeScript configuration
│   └── dist/                 # Production build output
│
├── database/                  # Database schema and migrations
│   ├── schema.sql            # Main database schema
│   ├── authentication_migration.sql  # Auth tables
│   ├── forms_migration.sql   # Forms tables
│   ├── stripe_migration.sql  # Stripe integration tables
│   ├── company_settings_migration.sql  # Company settings
│   ├── password_reset_migration.sql    # Password reset
│   ├── password_history_migration.sql  # Password history
│   ├── token_revocation_migration.sql  # Token revocation
│   ├── sessions_migration.sql          # Session tracking
│   └── ...                   # Additional migrations
│
├── scripts/                   # Utility scripts
│   ├── setup-admin-user.py   # Admin user setup
│   ├── test-admin-access.py  # Admin access testing
│   └── ...                   # Additional utility scripts
│
├── vercel.json                # Vercel deployment configuration
├── README.md                  # This file
└── ...                        # Additional documentation files
```

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Required Software
- **Python 3.9+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 18+** - [Download Node.js](https://nodejs.org/)
- **npm** or **yarn** - Comes with Node.js
- **Git** - [Download Git](https://git-scm.com/downloads)

### Required Accounts
- **Supabase Account** - [Sign up for free](https://supabase.com)
- **Stripe Account** - [Sign up for free](https://stripe.com) (for payment features)
- **AWS Account** - [Sign up for free](https://aws.amazon.com) (for production deployment)
- **Vercel Account** - [Sign up for free](https://vercel.com) (for frontend hosting)

### Optional (for production)
- **AWS CLI** - [Install AWS CLI](https://aws.amazon.com/cli/)
- **Docker** - [Install Docker](https://www.docker.com/get-started) (for backend deployment)

---

## 🚀 Installation & Setup

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Forms
```

### Step 2: Set Up Supabase Database

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com) and sign in
   - Click "New Project"
   - Fill in project details (name, database password, region)
   - Wait for project provisioning (2-3 minutes)

2. **Get Your Credentials**:
   - Go to Project Settings → API
   - Copy your **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - Copy your **anon public** key

3. **Apply Database Schema**:
   - Go to SQL Editor in Supabase dashboard
   - Click "New query"
   - Copy the contents of `database/schema.sql`
   - Paste and click "Run" (or press Cmd/Ctrl + Enter)
   - Apply all migration files in order (if needed)

### Step 3: Set Up Backend

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

# Create .env file
cp .env.example .env  # If .env.example exists, or create manually

# Edit .env file with your credentials (see Environment Variables section)
```

### Step 4: Set Up Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env  # If .env.example exists, or create manually

# Edit .env file with your credentials (see Environment Variables section)
```

### Step 5: Configure Environment Variables

See the [Environment Variables](#environment-variables) section below for complete configuration.

### Step 6: Run the Application

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn main:app --reload
```

Backend will be available at `http://localhost:8000`
API documentation at `http://localhost:8000/docs`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:5173`

### Step 7: Create Admin User

1. **Register a user** via the frontend registration page
2. **Get the user ID** from Supabase dashboard (Authentication → Users)
3. **Run the admin setup script**:
   ```bash
   cd scripts
   python setup-admin-user.py
   # Or manually run SQL:
   # INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
   # VALUES (gen_random_uuid(), 'YOUR_USER_ID', 'admin', NOW(), NOW())
   # ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
   ```

---

## 🔐 Environment Variables

### Backend Environment Variables (`.env` in `backend/`)

```env
# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here

# CORS Configuration (Required)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-app.vercel.app

# Stripe Configuration (Required for payments)
STRIPE_SECRET_KEY=sk_test_...  # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...  # Optional, for webhook verification

# Email Configuration (Required for email features)
# Option 1: AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Forms App

# Option 2: SendGrid (Alternative)
# SENDGRID_API_KEY=SG.xxx
# FROM_EMAIL=noreply@yourdomain.com
# FROM_NAME=Forms App

# Frontend URL (Required for email links)
FRONTEND_URL=http://localhost:5173  # or https://your-app.vercel.app in production

# Environment
ENVIRONMENT=development  # or production

# Server Configuration
PORT=8000  # Optional, defaults to 8000
```

### Frontend Environment Variables (`.env` in `frontend/`)

```env
# Backend API URL (Required)
VITE_API_URL=http://localhost:8000  # or https://your-backend-url.com in production

# Supabase Configuration (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Stripe Configuration (Required for payments)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...  # or pk_live_... for production
```

### Getting Your Credentials

#### Supabase Credentials
1. Go to Supabase Dashboard → Project Settings → API
2. **SUPABASE_URL**: Project URL
3. **SUPABASE_KEY**: anon public key
4. **SUPABASE_SERVICE_ROLE_KEY**: service_role key (keep secret!)
5. **SUPABASE_JWT_SECRET**: JWT Secret (in Project Settings → API → JWT Settings)

#### Stripe Credentials
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. **STRIPE_SECRET_KEY**: API Keys → Secret key
3. **STRIPE_WEBHOOK_SECRET**: Developers → Webhooks → Signing secret
4. **VITE_STRIPE_PUBLISHABLE_KEY**: API Keys → Publishable key

#### AWS SES Credentials (for email)
1. Go to AWS Console → IAM
2. Create IAM user with SES permissions
3. Generate access keys
4. **AWS_ACCESS_KEY_ID**: Access key ID
5. **AWS_SECRET_ACCESS_KEY**: Secret access key
6. **AWS_REGION**: Your AWS region (e.g., us-east-1)

---

## 🗄 Database Setup

### Initial Schema

The main database schema is in `database/schema.sql`. This includes:

- **clients** - Client/customer information
- **quotes** - Quote records with status and totals
- **line_items** - Quote line items
- **forms** - Form definitions
- **form_fields** - Form field definitions
- **form_submissions** - Form submission records
- **form_submission_answers** - Individual form answers
- **users** - User accounts (managed by Supabase Auth)
- **user_roles** - User role assignments (admin/customer)
- **assignments** - Quote/form assignments to users
- **company_settings** - Company configuration
- **password_reset_tokens** - Password reset tokens
- **revoked_tokens** - Revoked JWT tokens
- **user_sessions** - Active user sessions
- **password_history** - Password history for reuse prevention
- **login_attempts** - Login attempt tracking
- **stripe_customers** - Stripe customer mappings

### Applying Migrations

If you need to apply additional migrations:

1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of the migration file
3. Paste and run the SQL
4. Verify the migration was successful

### Database Indexes

The schema includes indexes for optimal performance:
- Quotes by client_id, status
- Line items by quote_id
- Forms by status, slug
- Form fields by form_id
- Submissions by form_id, user_id
- Assignments by user_id, item_type, item_id

### Row Level Security (RLS)

RLS policies are configured to ensure:
- Users can only see their own data
- Admins can see all data
- Customers can only see assigned items
- Public forms are accessible without authentication

---

## 💻 Running Locally

### Development Mode

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm run dev
```

### Production Build (Local Testing)

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

### Accessing the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

## 🚢 Deployment

### Frontend Deployment (Vercel)

1. **Connect Repository to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your Git repository
   - Select the `frontend` directory as the root

2. **Configure Build Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Set Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add all frontend environment variables (see above)
   - Set for Production, Preview, and Development

4. **Deploy**:
   - Vercel will automatically deploy on push to main branch
   - Or click "Deploy" in the dashboard

### Backend Deployment (AWS App Runner)

1. **Prerequisites**:
   ```bash
   # Install AWS CLI
   brew install awscli  # macOS
   # or download from aws.amazon.com/cli
   
   # Configure AWS CLI
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, Region
   ```

2. **Build and Push Docker Image**:
   ```bash
   cd backend
   chmod +x deploy-to-aws.sh
   ./deploy-to-aws.sh
   ```

3. **Create App Runner Service**:
   - Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
   - Click "Create service"
   - Choose "Container registry" → "Amazon ECR"
   - Select your repository and image
   - Configure:
     - Service name: `quote-builder-backend`
     - CPU: 0.25 vCPU
     - Memory: 0.5 GB
     - Port: 8000
   - Add all backend environment variables
   - Click "Create & deploy"

4. **Get Service URL**:
   - After deployment (5-10 minutes), get your service URL
   - Update frontend `VITE_API_URL` environment variable
   - Update Stripe webhook URL

5. **Update CORS**:
   - Update `ALLOWED_ORIGINS` in backend environment variables
   - Include your Vercel domain(s)

### Database (Supabase)

No deployment needed - Supabase handles hosting. Ensure:
- All migrations are applied
- RLS policies are enabled
- API keys are configured correctly

### Email Service (AWS SES)

1. **Verify Domain/Email**:
   - Go to AWS SES Console
   - Verify your sending domain or email address
   - Complete domain verification (add DNS records)

2. **Request Production Access** (if needed):
   - AWS SES starts in sandbox mode
   - Request production access to send to any email
   - Usually approved within 24 hours

3. **Configure IAM User**:
   - Create IAM user with SES permissions
   - Generate access keys
   - Add to backend environment variables

### Stripe Webhooks

1. **Create Webhook Endpoint**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Click "Add endpoint"
   - URL: `https://your-backend-url.com/api/stripe/webhook`
   - Select events: `invoice.paid`, `invoice.payment_failed`, etc.

2. **Get Webhook Secret**:
   - After creating webhook, copy the signing secret
   - Add to backend `STRIPE_WEBHOOK_SECRET` environment variable

---

## 📚 API Documentation

### Interactive API Docs

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Main API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/password-reset/request` - Request password reset
- `POST /api/auth/password-reset/confirm` - Confirm password reset
- `GET /api/auth/sessions` - Get active sessions
- `DELETE /api/auth/sessions/{session_id}` - Revoke session
- `POST /api/auth/logout-all` - Logout all devices
- `GET /api/auth/login-activity` - Get login activity

#### Quotes
- `GET /api/quotes` - List all quotes (admin) or assigned quotes (customer)
- `GET /api/quotes/{id}` - Get quote details
- `POST /api/quotes` - Create new quote (admin only)
- `PUT /api/quotes/{id}` - Update quote (admin only)
- `DELETE /api/quotes/{id}` - Delete quote (admin only)
- `PUT /api/quotes/{id}/accept` - Accept quote
- `GET /api/quotes/{id}/pdf` - Download quote PDF

#### Forms
- `GET /api/forms` - List all forms (admin) or assigned forms (customer)
- `GET /api/forms/{id}` - Get form details
- `GET /api/forms/public/{slug}` - Get public form by slug
- `POST /api/forms` - Create new form (admin only)
- `PUT /api/forms/{id}` - Update form (admin only)
- `DELETE /api/forms/{id}` - Delete form (admin only)
- `POST /api/forms/{id}/submit` - Submit form
- `GET /api/forms/{id}/submissions` - Get form submissions (admin only)

#### Clients
- `GET /api/clients` - List all clients (admin only)
- `GET /api/clients/{id}` - Get client details
- `POST /api/clients` - Create new client (admin only)
- `PUT /api/clients/{id}` - Update client (admin only)
- `DELETE /api/clients/{id}` - Delete client (admin only)

#### Assignments
- `POST /api/assignments` - Assign quote/form to users
- `GET /api/assignments` - Get assignments
- `DELETE /api/assignments/{id}` - Remove assignment

#### Stripe
- `POST /api/stripe/quotes/{id}/create-invoice` - Create Stripe invoice
- `GET /api/stripe/invoices/{invoice_id}` - Get invoice details
- `POST /api/stripe/webhook` - Stripe webhook handler

#### Company Settings
- `GET /api/company-settings` - Get company settings (admin only)
- `PUT /api/company-settings` - Update company settings (admin only)

### Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

Tokens are obtained via the `/api/auth/login` endpoint and are automatically included by the frontend.

---

## 🔒 Authentication & Authorization

### User Roles

#### Admin Role
- Full access to all quotes, forms, and clients
- Can create, edit, and delete quotes and forms
- Can assign quotes/forms to customers
- Can view all submissions and analytics
- Can manage company settings
- Can view all user data

#### Customer Role
- Can only view assigned quotes and forms
- Can accept quotes
- Can submit assigned forms
- Cannot create, edit, or delete items
- Cannot view other users' data
- Limited dashboard view

### Authentication Flow

1. **Registration**:
   - User registers via `/api/auth/register`
   - Supabase creates user account
   - Email verification sent (if enabled)
   - User role defaults to "customer"

2. **Login**:
   - User logs in via `/api/auth/login`
   - Supabase validates credentials
   - JWT token returned
   - Token stored in frontend (localStorage/sessionStorage)
   - Token included in all API requests

3. **Authorization**:
   - Backend validates JWT token on each request
   - Token checked against revocation list
   - User role retrieved from database
   - RLS policies enforce data access

4. **Session Management**:
   - Sessions tracked in database
   - Users can view active sessions
   - Users can revoke individual sessions
   - "Logout All" revokes all sessions

### Security Features

- **JWT Token Authentication**: Secure token-based authentication
- **Token Revocation**: Tokens can be revoked and blacklisted
- **Password History**: Prevents password reuse (last 5 passwords)
- **Account Lockout**: Temporary lockout after failed login attempts
- **Session Tracking**: All active sessions are tracked
- **Login Activity Monitoring**: Security event logging
- **Rate Limiting**: API rate limiting to prevent abuse
- **Row Level Security**: Database-level access control

---

## 🛡 Security Features

### Implemented Security Features

1. **Token Revocation System**
   - Tokens can be revoked on logout
   - Revoked tokens stored in database (hashed)
   - All authenticated requests check token revocation
   - "Logout All" functionality revokes all sessions

2. **Password History**
   - Prevents users from reusing last 5 passwords
   - Password hashes stored for comparison
   - Automatic cleanup of old password history

3. **Session Management**
   - Active sessions tracked in database
   - Device and browser information stored
   - IP address tracking
   - Individual session revocation
   - "Logout All Devices" functionality

4. **Login Activity Monitoring**
   - All login attempts logged
   - Success/failure status tracked
   - IP addresses recorded
   - Failure reasons logged
   - Users can view their login activity

5. **Account Lockout**
   - Temporary account lockout after failed attempts
   - Configurable lockout duration
   - Automatic unlock after timeout

6. **Rate Limiting**
   - API rate limiting to prevent abuse
   - Configurable rate limits per endpoint
   - Custom error messages for rate limit exceeded

7. **CORS Protection**
   - Configurable CORS origins
   - Credentials support
   - Production-ready CORS configuration

8. **Row Level Security (RLS)**
   - Database-level access control
   - Users can only access their own data
   - Admins can access all data
   - Public forms accessible without authentication

### Security Best Practices

- ✅ Never commit `.env` files
- ✅ Use environment variables for all secrets
- ✅ Enable HTTPS in production
- ✅ Regularly update dependencies
- ✅ Monitor login activity for suspicious behavior
- ✅ Use strong passwords (enforced by validation)
- ✅ Implement proper error handling (no sensitive data in errors)
- ✅ Validate all user input
- ✅ Use parameterized queries (via Supabase client)

---

## 🧪 Testing

### Manual Testing

1. **Authentication Testing**:
   - Register new user
   - Login with credentials
   - Test password reset flow
   - Test email verification
   - Test session management
   - Test token revocation

2. **Quote Testing**:
   - Create new quote
   - Add line items
   - Calculate totals
   - Generate PDF
   - Assign to customer
   - Accept quote
   - Create Stripe invoice

3. **Form Testing**:
   - Create new form
   - Add fields with different types
   - Test conditional logic
   - Publish form
   - Submit form via public URL
   - View submissions

4. **Client Testing**:
   - Create new client
   - Update client information
   - Assign quotes/forms to client
   - View client details

5. **Payment Testing**:
   - Accept quote
   - Create Stripe invoice
   - Test payment webhook
   - Verify payment status updates

### API Testing

Use the interactive API docs at `http://localhost:8000/docs` or use tools like:
- **Postman**: Import API collection
- **curl**: Command-line testing
- **Thunder Client**: VS Code extension

### Example API Calls

```bash
# Register user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "SecurePass123!"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "SecurePass123!"}'

# Get quotes (with token)
curl -X GET http://localhost:8000/api/quotes \
  -H "Authorization: Bearer <token>"
```

---

## 🔧 Troubleshooting

### Common Issues

#### Backend Won't Start
- **Check Python version**: Ensure Python 3.9+ is installed
- **Check virtual environment**: Ensure venv is activated
- **Check dependencies**: Run `pip install -r requirements.txt`
- **Check environment variables**: Ensure `.env` file is configured
- **Check port**: Ensure port 8000 is not in use

#### Frontend Won't Start
- **Check Node.js version**: Ensure Node.js 18+ is installed
- **Check dependencies**: Run `npm install`
- **Check environment variables**: Ensure `.env` file is configured
- **Check port**: Ensure port 5173 is not in use

#### Database Connection Errors
- **Check Supabase URL**: Ensure correct project URL
- **Check API key**: Ensure correct anon key
- **Check network**: Ensure internet connection
- **Check RLS policies**: Ensure policies are configured correctly

#### Authentication Issues
- **Check JWT secret**: Ensure JWT secret matches Supabase
- **Check token expiration**: Tokens expire after 1 hour (default)
- **Check token revocation**: Ensure token is not revoked
- **Check user role**: Ensure user has correct role assigned

#### CORS Errors
- **Check ALLOWED_ORIGINS**: Ensure frontend URL is included
- **Check credentials**: Ensure `allow_credentials=True` in CORS config
- **Check headers**: Ensure Authorization header is allowed

#### Email Not Sending
- **Check AWS SES**: Ensure SES is configured and verified
- **Check credentials**: Ensure AWS credentials are correct
- **Check region**: Ensure AWS region matches
- **Check sandbox mode**: Request production access if needed
- **Check FROM_EMAIL**: Ensure sender email is verified

#### Stripe Issues
- **Check API keys**: Ensure correct Stripe keys (test vs live)
- **Check webhook secret**: Ensure webhook secret is configured
- **Check webhook URL**: Ensure webhook URL is correct
- **Check events**: Ensure correct events are selected

### Debugging Tips

1. **Check Logs**:
   - Backend: Check terminal output
   - Frontend: Check browser console
   - AWS: Check CloudWatch logs
   - Supabase: Check database logs

2. **Test Endpoints**:
   - Use `/health` endpoint to test backend
   - Use `/docs` endpoint to view API documentation
   - Test individual endpoints with curl or Postman

3. **Check Environment Variables**:
   - Verify all required variables are set
   - Check for typos in variable names
   - Ensure no extra spaces or quotes

4. **Database Debugging**:
   - Check Supabase dashboard for errors
   - Verify RLS policies are enabled
   - Check table data directly in Supabase

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow code style and add tests
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**: Describe your changes clearly

### Code Style

- **Python**: Follow PEP 8 style guide
- **TypeScript**: Follow ESLint configuration
- **React**: Follow React best practices
- **SQL**: Use consistent formatting

### Testing

- Add tests for new features
- Ensure all tests pass
- Test manually before submitting PR

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📞 Support

For support, please:
- Check the troubleshooting section above
- Review the documentation files in the repository
- Open an issue on GitHub
- Contact the development team

---

## 🎯 Roadmap

### Planned Features
- [ ] Multi-language support
- [ ] Advanced form analytics
- [ ] Custom form themes
- [ ] Recurring billing/subscriptions
- [ ] Client portal enhancements
- [ ] Mobile app (React Native)
- [ ] Advanced reporting and exports
- [ ] Integration with accounting software
- [ ] Custom email templates editor
- [ ] Advanced workflow automation

### Known Limitations
- Forms are not yet Typeform-style (one question at a time)
- No real-time collaboration on quotes/forms
- Limited customization options for PDFs
- No mobile app yet

---

## 🙏 Acknowledgments

- **Supabase** - Database and authentication
- **FastAPI** - Backend framework
- **React** - Frontend framework
- **Stripe** - Payment processing
- **AWS** - Infrastructure and email service
- **Vercel** - Frontend hosting

---

**Last Updated**: November 2024

**Version**: 1.0.0
