# Company Settings Implementation

## Overview

Seller/company information is now automatically included on every quote. This information appears in both the web view and PDF exports, making it seamless for your team and professional for customers.

## Features

- **Company Information Display**: Company details appear on all quotes automatically
- **Settings Management**: Easy-to-use settings page to update company information
- **PDF Integration**: Company information is included in PDF exports
- **Professional Layout**: Company info appears alongside client info in a clean two-column layout

## Setup Instructions

### 1. Run Database Migration

Execute the migration SQL in your Supabase SQL Editor:

```sql
-- Run: database/company_settings_migration.sql
```

This creates the `company_settings` table and sets up the necessary triggers.

### 2. Configure Company Information

1. Navigate to **Settings** in the navigation menu
2. Fill in your company information:
   - Company Name (required for display)
   - Email
   - Phone
   - Address
   - Website
   - Tax ID
   - Logo URL (optional - URL to your company logo)

3. Click **Save Settings**

## How It Works

### On Quotes

- Company information appears in the "From" section on the left
- Client information appears in the "Bill To" section on the right
- Both sections are displayed side-by-side for a professional invoice-like appearance
- If a logo URL is provided, it appears at the top of the company information section

### In PDFs

- Company information is automatically included in PDF exports
- Same side-by-side layout as the web view
- All company details are preserved in the PDF format

### Settings Management

- Access via the **Settings** link in the navigation
- Update company information at any time
- Changes apply to all future quotes immediately
- Existing quotes will show the updated information when viewed

## Database Schema

The `company_settings` table stores:
- `company_name`: Your company name
- `email`: Contact email
- `phone`: Contact phone number
- `address`: Company address (supports multi-line)
- `website`: Company website URL
- `tax_id`: Tax identification number (EIN, VAT, etc.)
- `logo_url`: URL to company logo image

## API Endpoints

- `GET /api/company-settings` - Get current company settings
- `PUT /api/company-settings` - Update company settings (creates if doesn't exist)

## Benefits

1. **Seamless for Your Team**: Set once, appears everywhere
2. **Professional for Customers**: Standard invoice format with clear seller/buyer information
3. **Easy Updates**: Change company info anytime without touching individual quotes
4. **Consistent Branding**: Logo and company details on every quote

## Notes

- Company information is optional - quotes will still work if no company settings are configured
- The system uses the first row in the `company_settings` table (only one row is expected)
- Logo URL should be a publicly accessible image URL
- All fields except company name are optional



