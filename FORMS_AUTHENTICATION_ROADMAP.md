# Forms Authentication & Permissions Roadmap

## Current State: How Forms Work Now

### Public Form Access (Current Implementation)

**How it works:**
1. **Form Creation**: When you create a form, it automatically gets a unique `public_url_slug` (e.g., `form-abc12345`)
2. **Public URL**: Forms are accessible at `/public/form/{slug}` (e.g., `https://yourdomain.com/public/form/form-abc12345`)
3. **No Authentication Required**: Anyone with the URL can:
   - View the form (if status is "published")
   - Fill it out
   - Submit responses

**Current Flow:**
```
User visits /public/form/{slug}
  ↓
Frontend calls GET /api/forms/public/{slug}
  ↓
Backend checks:
  - Form exists?
  - Status is "published"?
  ↓
If valid, form is displayed
  ↓
User fills out form
  ↓
Frontend calls POST /api/forms/{form_id}/submit
  ↓
Backend saves submission (no auth check)
```

**Current Limitations:**
- ❌ No user authentication
- ❌ No access control (anyone with URL can submit)
- ❌ No way to assign forms to specific customers
- ❌ No way to track who submitted what
- ❌ No way to restrict submissions (e.g., one per person)
- ❌ No way to require login before viewing/submitting

---

## Future State: Authentication & Permissions

### Goal: Assign Forms to Specific Customers

**Desired Flow:**
```
You create a form
  ↓
You assign it to customer@email.com
  ↓
Customer receives email with unique link
  ↓
Customer clicks link → prompted to login/verify
  ↓
Customer fills out form (only they can access it)
  ↓
You can see who submitted what
```

---

## Implementation Roadmap

### Phase 1: User Authentication Foundation

#### 1.1 Choose Authentication Provider
**Options:**
- **Supabase Auth** (Recommended - already using Supabase)
  - Built-in email/password, OAuth, magic links
  - Row Level Security (RLS) integration
  - Free tier available
  
- **Auth0** (Alternative)
  - More features, but additional cost
  - Good for enterprise needs

- **Custom Auth** (Not recommended)
  - More work, security concerns
  - Only if you have specific requirements

**Recommendation: Supabase Auth** - You're already using Supabase, so this is the natural choice.

#### 1.2 Database Schema Changes

**New Tables Needed:**

```sql
-- Users table (if not using Supabase Auth's built-in auth.users)
-- Note: Supabase Auth provides auth.users automatically

-- Form Assignments table
CREATE TABLE form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id), -- Who assigned it
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional: form expiration
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, expired
  access_token UUID UNIQUE, -- Unique token for email links
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);

-- Update form_submissions to link to user
ALTER TABLE form_submissions 
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN assignment_id UUID REFERENCES form_assignments(id);

-- Form access settings
ALTER TABLE forms
  ADD COLUMN access_type VARCHAR(20) DEFAULT 'public', -- public, assigned, authenticated
  ADD COLUMN require_authentication BOOLEAN DEFAULT false,
  ADD COLUMN allow_multiple_submissions BOOLEAN DEFAULT true;
```

#### 1.3 Backend Changes

**New Endpoints Needed:**

```python
# Authentication endpoints (if using Supabase Auth, these are handled by Supabase)
# But you'll need middleware to verify tokens

# Form assignment endpoints
POST   /api/forms/{form_id}/assign          # Assign form to user(s)
GET    /api/forms/{form_id}/assignments     # Get all assignments
DELETE /api/forms/{form_id}/assignments/{id} # Remove assignment

# User-specific endpoints
GET    /api/users/me/forms                   # Get forms assigned to current user
GET    /api/users/me/submissions             # Get user's submissions
```

**Middleware for Authentication:**
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Verify JWT token and return user"""
    token = credentials.credentials
    # Verify with Supabase
    # Return user info
    pass
```

#### 1.4 Frontend Changes

**New Components Needed:**
- `LoginPage.tsx` - User login/registration
- `AuthProvider.tsx` - Context for auth state
- `ProtectedRoute.tsx` - Wrapper for routes requiring auth
- `FormAssignmentModal.tsx` - UI to assign forms to users

**Updated Components:**
- `PublicFormView.tsx` - Check if auth required, verify assignment
- `FormView.tsx` - Show assignments, submission tracking
- `FormsList.tsx` - Filter by assigned/unassigned

---

### Phase 2: Form Assignment System

#### 2.1 Assignment Workflow

**When you assign a form:**
1. Create `form_assignment` record
2. Generate unique `access_token` (UUID)
3. Send email to customer with link: `/public/form/{slug}?token={access_token}`
4. Link expires after set time (optional)

**When customer accesses form:**
1. Check if form requires authentication
2. If `access_type = 'assigned'`:
   - Verify `access_token` in URL
   - Check if assignment exists and is valid
   - If not logged in, prompt login
   - Link user account to assignment
3. Allow form access

#### 2.2 Email Integration

**Options:**
- **SendGrid** (Recommended)
  - Easy integration
  - Good free tier
  - Template support
  
- **AWS SES**
  - Very cheap
  - More setup required
  
- **Supabase Edge Functions + Email Service**
  - Serverless email sending
  - Good for automation

**Email Template Needed:**
```
Subject: You've been assigned a form: {form_name}

Hi {customer_name},

{your_name} has assigned you a form to complete.

Click here to access: {form_url_with_token}

This link is unique to you and will expire on {expiry_date}.

Thanks!
```

---

### Phase 3: Access Control & Permissions

#### 3.1 Form Access Types

**Three access modes:**

1. **Public** (Current)
   - Anyone with URL can access
   - No authentication required
   - Use case: General surveys, public forms

2. **Assigned** (New)
   - Only assigned users can access
   - Requires authentication
   - Unique token per assignment
   - Use case: Customer-specific forms

3. **Authenticated** (New)
   - Any logged-in user can access
   - No assignment needed
   - Use case: Internal forms, employee surveys

#### 3.2 Submission Controls

**New settings:**
- `allow_multiple_submissions`: Can user submit multiple times?
- `max_submissions_per_user`: Limit submissions
- `submission_deadline`: Form closes after date
- `require_all_fields`: Must fill all required fields

---

### Phase 4: Submission Tracking & Management

#### 4.1 Enhanced Submission View

**New features:**
- See who submitted (user name/email)
- See when they submitted
- See assignment status (pending/completed)
- Filter by user, date, status
- Export submissions to CSV/Excel

#### 4.2 Dashboard

**New page: `/forms/:id/submissions`**
- List all submissions
- Filter and search
- View individual submission details
- Mark as reviewed/archived

---

## Implementation Steps (Recommended Order)

### Step 1: Set Up Supabase Auth
1. Enable Supabase Authentication in dashboard
2. Configure email templates
3. Set up email provider (SendGrid/SES)
4. Test user registration/login

### Step 2: Add Authentication Middleware
1. Create `get_current_user` dependency
2. Add auth check to protected endpoints
3. Update frontend to handle auth state
4. Add login/logout UI

### Step 3: Create Assignment System
1. Add `form_assignments` table
2. Create assignment endpoints
3. Build assignment UI in FormBuilder
4. Generate unique access tokens

### Step 4: Update Form Access Logic
1. Add `access_type` to forms
2. Update `PublicFormView` to check assignments
3. Add token verification
4. Handle authentication flow

### Step 5: Email Integration
1. Set up email service (SendGrid/SES)
2. Create email templates
3. Add email sending on assignment
4. Test email delivery

### Step 6: Submission Tracking
1. Link submissions to users/assignments
2. Build submissions dashboard
3. Add filtering and export
4. Add submission status management

---

## Database Migration Example

```sql
-- Step 1: Add access control columns to forms
ALTER TABLE forms
  ADD COLUMN access_type VARCHAR(20) DEFAULT 'public',
  ADD COLUMN require_authentication BOOLEAN DEFAULT false,
  ADD COLUMN allow_multiple_submissions BOOLEAN DEFAULT true,
  ADD COLUMN submission_deadline TIMESTAMP WITH TIME ZONE;

-- Step 2: Create form_assignments table
CREATE TABLE form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending',
  access_token UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);

-- Step 3: Link submissions to users
ALTER TABLE form_submissions
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN assignment_id UUID REFERENCES form_assignments(id);

-- Step 4: Add indexes
CREATE INDEX idx_form_assignments_form_id ON form_assignments(form_id);
CREATE INDEX idx_form_assignments_user_id ON form_assignments(user_id);
CREATE INDEX idx_form_assignments_token ON form_assignments(access_token);
CREATE INDEX idx_submissions_user_id ON form_submissions(user_id);
CREATE INDEX idx_submissions_assignment_id ON form_submissions(assignment_id);
```

---

## Security Considerations

### Current Security Gaps:
1. ❌ No rate limiting on submissions
2. ❌ No CSRF protection
3. ❌ No input validation on all fields
4. ❌ No spam prevention

### Future Security Needs:
1. ✅ Rate limiting (max submissions per IP/user)
2. ✅ CSRF tokens for form submissions
3. ✅ Input sanitization and validation
4. ✅ CAPTCHA for public forms
5. ✅ Token expiration and rotation
6. ✅ Audit logging for sensitive operations

---

## Estimated Timeline

- **Phase 1 (Auth Foundation)**: 1-2 weeks
- **Phase 2 (Assignment System)**: 1-2 weeks
- **Phase 3 (Access Control)**: 1 week
- **Phase 4 (Tracking)**: 1 week

**Total: 4-6 weeks** (depending on complexity and testing)

---

## Next Steps

1. **Decide on authentication provider** (recommend Supabase Auth)
2. **Set up Supabase Auth** in your project
3. **Create database migration** for assignments
4. **Build authentication middleware** in backend
5. **Add login UI** to frontend
6. **Test authentication flow** end-to-end
7. **Build assignment system** incrementally

---

## Questions to Consider

1. **Do you want to allow users to self-register, or only invite them?**
   - Self-register: More open, less control
   - Invite-only: More control, better for B2B

2. **Should forms expire after a certain date?**
   - Yes: Add `expires_at` to assignments
   - No: Forms stay active until manually closed

3. **Can users submit multiple times?**
   - Yes: Allow multiple submissions
   - No: One submission per assignment

4. **Do you need to track partial submissions?**
   - Yes: Save progress as user fills form
   - No: Only save on final submit

5. **Should you be able to see who's viewed but not submitted?**
   - Yes: Track form views separately
   - No: Only track submissions

---

## Summary

**Current State:**
- Forms are completely public
- Anyone with URL can submit
- No user tracking
- No access control

**Future State:**
- Forms can be assigned to specific users
- Authentication required for assigned forms
- Track who submitted what
- Control access and submissions
- Email notifications for assignments

**Path Forward:**
1. Implement Supabase Auth
2. Add assignment system
3. Update access control
4. Add email notifications
5. Build submission tracking

The foundation is solid - you just need to add the authentication and assignment layers on top!

