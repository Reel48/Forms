# Authentication Implementation Plan

## Overview
This document outlines the implementation plan for adding user authentication with admin and customer roles to the Forms application.

## User Roles

### Admin User (`admin@reel48.com`)
- **Full Access**: Can create, edit, delete quotes and forms
- **Assignment Management**: Can assign quotes and forms to customers
- **View All**: Can see all quotes, forms, clients, and submissions
- **Settings Access**: Can manage company settings

### Customer Accounts
- **View Only**: Can only view quotes and forms assigned to them
- **No Creation**: Cannot create quotes, forms, or documents
- **Submission Access**: Can submit assigned forms
- **Limited Dashboard**: Only sees their assigned items

## Additional Feature Suggestions

### 1. **Email Notifications** ⭐ Recommended
- Send email when admin assigns a quote/form to customer
- Notify admin when customer submits a form
- Reminder emails for pending assignments

### 2. **Customer Dashboard** ⭐ Recommended
- Dedicated customer view showing only their assigned items
- Status indicators (pending, completed, expired)
- Quick access to assigned forms/quotes

### 3. **Assignment Management UI** ⭐ Recommended
- Bulk assignment (assign to multiple customers at once)
- Assignment history (who assigned what, when)
- Unassign functionality

### 4. **Customer Self-Registration** (Optional)
- Allow customers to create accounts themselves
- Admin approval workflow (optional)
- Or invite-only system (admin creates accounts)

### 5. **Quote/Form Expiration** (Optional)
- Set expiration dates on assignments
- Automatic status updates when expired
- Notifications before expiration

### 6. **Activity Logging** (Optional)
- Track when customers view quotes/forms
- Log admin actions (assignments, edits)
- Audit trail for compliance

### 7. **Customer Profile Management** (Optional)
- Customers can update their own profile
- Link customer accounts to client records
- Profile picture upload

### 8. **Multi-Admin Support** (Future)
- Support for multiple admin accounts
- Admin role hierarchy (super admin, regular admin)
- Permission granularity

## Implementation Phases

### Phase 1: Authentication Foundation ✅ (In Progress)
1. Set up Supabase Auth
2. Create authentication middleware
3. Build login/register endpoints
4. Frontend auth context

### Phase 2: Database Schema
1. User roles table
2. Quote assignments table
3. Form assignments table
4. Link existing data to users

### Phase 3: Access Control
1. Protect admin routes
2. Filter customer views
3. Assignment endpoints
4. Role-based UI rendering

### Phase 4: UI Components
1. Login/Register pages
2. Customer dashboard
3. Assignment UI for admin
4. Protected route wrapper

### Phase 5: Polish & Testing
1. Error handling
2. Loading states
3. Email notifications (if implemented)
4. Testing all flows

## Database Schema Changes

### New Tables

```sql
-- User roles (extends Supabase auth.users)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'admin' or 'customer'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quote assignments
CREATE TABLE quote_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'assigned', -- assigned, viewed, accepted, declined
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(quote_id, user_id)
);

-- Form assignments
CREATE TABLE form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, expired
  access_token UUID UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);
```

### Updates to Existing Tables

```sql
-- Link quotes to creator
ALTER TABLE quotes ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Link forms to creator
ALTER TABLE forms ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Link submissions to users
ALTER TABLE form_submissions 
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN assignment_id UUID REFERENCES form_assignments(id);
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (customer by default)
- `POST /api/auth/login` - Login (handled by Supabase client)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Assignments
- `POST /api/quotes/{quote_id}/assign` - Assign quote to customer(s)
- `GET /api/quotes/{quote_id}/assignments` - Get quote assignments
- `DELETE /api/quotes/{quote_id}/assignments/{assignment_id}` - Unassign
- `POST /api/forms/{form_id}/assign` - Assign form to customer(s)
- `GET /api/forms/{form_id}/assignments` - Get form assignments
- `DELETE /api/forms/{form_id}/assignments/{assignment_id}` - Unassign

### Customer Endpoints
- `GET /api/customer/quotes` - Get assigned quotes
- `GET /api/customer/forms` - Get assigned forms
- `GET /api/customer/dashboard` - Get dashboard data

## Security Considerations

1. **JWT Token Verification**: All protected routes verify Supabase JWT tokens
2. **Role Checking**: Middleware checks user role before allowing access
3. **Row Level Security**: Supabase RLS policies for data isolation
4. **Assignment Validation**: Verify admin is assigning to valid customers
5. **Customer Data Isolation**: Customers can only see their assigned items

## Next Steps

1. ✅ Review and approve plan
2. ⏳ Set up Supabase Auth
3. ⏳ Create database migrations
4. ⏳ Implement backend authentication
5. ⏳ Build frontend auth
6. ⏳ Add assignment functionality
7. ⏳ Test and deploy

