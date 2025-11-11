# Email Setup Guide

This guide explains how to set up and use the email functionality in the Forms application.

## Features Implemented

### 1. Password Reset via Email
- Users can request a password reset by providing their email address
- A secure reset token is generated and sent via email
- Tokens expire after 1 hour for security
- Users can reset their password using the token

### 2. Assignment Notifications
- **Form Assignments**: Customers receive email notifications when a form is assigned to them
- **Quote Assignments**: Customers receive email notifications when a quote is assigned to them
- Emails include direct links to view the assigned item
- Emails include the name of the admin who made the assignment

## Setup Instructions

### 1. Install Dependencies

The email functionality uses SendGrid for email delivery. Install the required package:

```bash
cd backend
pip install -r requirements.txt
```

This will install `sendgrid==6.11.0` along with other dependencies.

### 2. Set Up SendGrid Account

1. **Create a SendGrid Account**
   - Go to [https://sendgrid.com](https://sendgrid.com)
   - Sign up for a free account (100 emails/day free tier)
   - Verify your email address

2. **Create an API Key**
   - Navigate to Settings → API Keys
   - Click "Create API Key"
   - Name it (e.g., "Forms App Production")
   - Select "Full Access" or "Restricted Access" with Mail Send permissions
   - Copy the API key (you won't be able to see it again)

3. **Verify Sender Identity** (Required for production)
   - Go to Settings → Sender Authentication
   - Verify a Single Sender or set up Domain Authentication
   - For testing, you can use Single Sender Verification

### 3. Configure Environment Variables

Add the following environment variables to your `.env` file or deployment environment:

```bash
# SendGrid Configuration
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Email Sender Configuration
FROM_EMAIL=noreply@yourdomain.com  # Must be verified in SendGrid
FROM_NAME=Forms App  # Display name for emails

# Frontend URL (for links in emails)
FRONTEND_URL=https://your-app.vercel.app  # Or http://localhost:5173 for local dev
```

### 4. Run Database Migration

Run the password reset tokens migration:

```sql
-- Run this in your Supabase SQL Editor
-- File: database/password_reset_migration.sql
```

Or apply it via the Supabase MCP tools if available.

### 5. Test Email Functionality

#### Test Password Reset
```bash
# Request password reset
curl -X POST http://localhost:8000/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Confirm password reset (use token from email)
curl -X POST http://localhost:8000/api/auth/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{"token": "reset_token_from_email", "new_password": "newSecurePassword123"}'
```

#### Test Assignment Notifications
Assignment notifications are automatically sent when:
- An admin assigns a form to a customer via `POST /api/forms/{form_id}/assign`
- An admin assigns a quote to a customer via `POST /api/quotes/{quote_id}/assign`

## API Endpoints

### Password Reset

#### Request Password Reset
```
POST /api/auth/password-reset/request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Note:** The response is always the same to prevent email enumeration attacks.

#### Confirm Password Reset
```
POST /api/auth/password-reset/confirm
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "new_password": "newSecurePassword123"
}
```

**Response:**
```json
{
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or expired token
- `500 Internal Server Error`: Server error or token table not configured

## Email Templates

The email service includes three email templates:

1. **Password Reset Email** (`send_password_reset_email`)
   - Subject: "Reset Your Password"
   - Includes reset link with token
   - Token expires in 1 hour

2. **Form Assignment Notification** (`send_form_assignment_notification`)
   - Subject: "New Form Assigned: {form_name}"
   - Includes form name and direct link
   - Shows who assigned the form

3. **Quote Assignment Notification** (`send_quote_assignment_notification`)
   - Subject: "New Quote Assigned: {quote_title}"
   - Includes quote title, number, and direct link
   - Shows who assigned the quote

All emails are HTML formatted with plain text fallbacks.

## Frontend Integration

### Password Reset Flow

1. **Request Reset Page** (`/forgot-password`)
   ```typescript
   const requestReset = async (email: string) => {
     const response = await fetch('/api/auth/password-reset/request', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email })
     });
     // Show success message
   };
   ```

2. **Reset Password Page** (`/reset-password?token=...`)
   ```typescript
   const resetPassword = async (token: string, newPassword: string) => {
     const response = await fetch('/api/auth/password-reset/confirm', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ token, new_password: newPassword })
     });
     // Redirect to login on success
   };
   ```

### Assignment Notifications

Assignment notifications are sent automatically when assignments are created. No frontend changes are required, but you may want to:

- Show a success message after assignment: "Form assigned and notification email sent"
- Allow admins to opt-out of sending emails for specific assignments (future feature)

## Troubleshooting

### Emails Not Sending

1. **Check SendGrid API Key**
   - Verify `SENDGRID_API_KEY` is set correctly
   - Check SendGrid dashboard for API key status

2. **Check Sender Verification**
   - Ensure `FROM_EMAIL` is verified in SendGrid
   - For production, use Domain Authentication

3. **Check Logs**
   - Backend logs will show email sending status
   - Look for "Email sent successfully" or error messages

4. **Test SendGrid Connection**
   - Check SendGrid dashboard → Activity for email delivery status
   - Verify API key has proper permissions

### Password Reset Not Working

1. **Check Database Migration**
   - Ensure `password_reset_tokens` table exists
   - Run migration if needed: `database/password_reset_migration.sql`

2. **Check Token Expiration**
   - Tokens expire after 1 hour
   - Request a new reset if token expired

3. **Check Frontend URL**
   - Verify `FRONTEND_URL` environment variable is correct
   - Reset links use this URL

## Security Considerations

1. **Email Enumeration Prevention**
   - Password reset endpoint always returns success
   - Prevents attackers from discovering valid email addresses

2. **Token Security**
   - Tokens are cryptographically secure (32-byte URL-safe tokens)
   - Tokens expire after 1 hour
   - Tokens are single-use (marked as used after reset)

3. **Rate Limiting** (Recommended)
   - Consider adding rate limiting to password reset endpoint
   - Prevent abuse of email sending

4. **HTTPS in Production**
   - Always use HTTPS in production
   - Reset tokens in URLs should be transmitted securely

## Additional Use Cases (Future Enhancements)

Here are some additional email use cases you might want to implement:

### 1. Welcome Emails
- Send welcome email when new user registers
- Include getting started guide

### 2. Form Submission Confirmations
- Send confirmation email to customer after form submission
- Include submission summary

### 3. Quote Status Updates
- Notify customer when quote status changes (accepted, declined)
- Include updated quote details

### 4. Reminder Emails
- Send reminders for pending form submissions
- Send reminders for quotes approaching expiration

### 5. Admin Notifications
- Notify admin when customer submits a form
- Notify admin when customer accepts/declines a quote

### 6. Invoice/Receipt Emails
- Send invoice when quote is accepted
- Send receipt after payment

Would you like me to implement any of these additional features?

## Support

For issues or questions:
1. Check SendGrid dashboard for delivery status
2. Review backend logs for error messages
3. Verify all environment variables are set correctly
4. Ensure database migrations are applied

