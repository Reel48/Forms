# Implementation Gameplan: Hybrid Address with Google Places Autocomplete

## 🎯 Goal
Implement Option 3 (Hybrid Address) with Google Places API autocomplete to transfer client addresses to Stripe invoices accurately.

---

## 📋 Implementation Plan

### Phase 1: Database Schema Updates

**1.1 Add Structured Address Fields**
- Add new columns to `clients` table:
  - `address_line1` (VARCHAR 255) - Street address
  - `address_line2` (VARCHAR 255) - Apartment, suite, etc. (optional)
  - `address_city` (VARCHAR 100) - City
  - `address_state` (VARCHAR 50) - State/Province
  - `address_postal_code` (VARCHAR 20) - ZIP/Postal code
  - `address_country` (VARCHAR 2) - Country code (ISO 3166-1 alpha-2, default 'US')

**1.2 Keep Existing Field**
- Keep `address` TEXT field for backward compatibility
- Use as fallback if structured fields not available

**1.3 Migration Strategy**
- Create migration SQL file
- Existing addresses remain in `address` field
- Users can upgrade addresses when editing clients

---

### Phase 2: Backend Changes

**2.1 Update Models** (`backend/models.py`)
- Add structured address fields to `ClientBase` model
- Make all address fields optional
- Keep `address` field for compatibility

**2.2 Update Stripe Service** (`backend/stripe_service.py`)
- Create `format_address_for_stripe()` function:
  - Priority 1: Use structured fields if all required fields present
  - Priority 2: Parse `address` text field if structured not available
  - Priority 3: Use `address` as `line1` if parsing fails
- Update `create_or_get_customer()` to include address

**2.3 Address Parsing Function** (if needed)
- Simple regex-based parsing for common US formats
- Extract: street, city, state, zip
- Fallback to putting entire address in `line1`

**2.4 API Endpoints** (if needed)
- No new endpoints required
- Existing client create/update endpoints will handle new fields

---

### Phase 3: Frontend Changes

**3.1 Google Places API Setup**
- Get Google Places API key
- Add to frontend environment variables (`VITE_GOOGLE_PLACES_API_KEY`)
- Add script tag or use `@react-google-maps/api` library

**3.2 Update Client Form** (`frontend/src/pages/ClientsList.tsx`)
- Add "Address" section with toggle:
  - **Simple Mode**: Single textarea (current behavior)
  - **Structured Mode**: Separate fields with Google Places autocomplete
- Toggle button: "Use structured address"
- When Places autocomplete selected:
  - Auto-populate structured fields
  - Also populate text field for compatibility

**3.3 Address Input Component** (New file: `frontend/src/components/AddressInput.tsx`)
- Reusable component for address input
- Features:
  - Google Places Autocomplete input
  - Structured fields (line1, line2, city, state, postal_code, country)
  - Toggle between simple/structured modes
  - Auto-sync between text and structured fields

**3.4 Update API Types** (`frontend/src/api.ts`)
- Add structured address fields to `Client` interface
- Update `ClientCreate` interface

**3.5 Update Quote View** (if needed)
- Display structured address if available
- Fallback to text address

---

### Phase 4: Stripe Integration

**4.1 Customer Address**
- When creating/updating Stripe customer:
  - Use structured address if available
  - Fallback to parsed text address
  - Include in `customer.address` field

**4.2 Invoice Address** (Optional)
- Can set billing address on invoice if different from customer
- For now, use customer address (simpler)

---

## 🔧 Technical Details

### Google Places API Integration

**Library Choice:**
- Option A: `@react-google-maps/api` (React-specific, easier)
- Option B: Direct Google Places API (more control, more setup)

**Recommendation:** `@react-google-maps/api` for easier React integration

**API Key Setup:**
1. Get key from Google Cloud Console
2. Enable "Places API"
3. Add to `.env` as `VITE_GOOGLE_PLACES_API_KEY`
4. Restrict key to your domain (production)

**Component Structure:**
```typescript
<AddressInput
  value={addressData}
  onChange={handleAddressChange}
  mode="structured" // or "simple"
  onModeChange={setMode}
/>
```

### Address Data Structure

**Frontend State:**
```typescript
interface AddressData {
  // Simple mode
  address?: string;
  
  // Structured mode
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
}
```

**Backend Model:**
```python
class ClientBase(BaseModel):
    # ... existing fields ...
    address: Optional[str] = None  # Keep for compatibility
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_country: Optional[str] = "US"
```

### Stripe Address Formatting

**Function Logic:**
```python
def format_address_for_stripe(client_data: Dict[str, Any]) -> Optional[Dict[str, str]]:
    # Check if structured address is complete
    if all([
        client_data.get("address_line1"),
        client_data.get("address_city"),
        client_data.get("address_state"),
        client_data.get("address_postal_code")
    ]):
        return {
            "line1": client_data["address_line1"],
            "line2": client_data.get("address_line2"),
            "city": client_data["address_city"],
            "state": client_data["address_state"],
            "postal_code": client_data["address_postal_code"],
            "country": client_data.get("address_country", "US")
        }
    
    # Fallback: parse text address
    if client_data.get("address"):
        return parse_text_address(client_data["address"])
    
    return None
```

---

## 📦 Dependencies

### Backend
- No new dependencies (use existing libraries)

### Frontend
- `@react-google-maps/api` - Google Maps/Places React integration
- Or direct Google Places API script loading

**Install:**
```bash
cd frontend
npm install @react-google-maps/api
```

---

## 🗄️ Database Migration

**File:** `database/address_structure_migration.sql`

```sql
-- Add structured address fields
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS address_city VARCHAR(100),
ADD COLUMN IF NOT EXISTS address_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS address_postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS address_country VARCHAR(2) DEFAULT 'US';

-- Keep existing address field (no changes needed)
-- It will remain for backward compatibility
```

---

## 🎨 UI/UX Design

### Client Form Layout

**Simple Mode (Default):**
```
[Address Toggle: ☐ Use structured address]

Address:
[Textarea - full address]
```

**Structured Mode (When Toggled):**
```
[Address Toggle: ☑ Use structured address]

Address:
[Google Places Autocomplete Input]
  ↓ (when address selected)
  
Street Address: [auto-filled]
Address Line 2: [optional, auto-filled]
City: [auto-filled]
State: [auto-filled]
ZIP Code: [auto-filled]
Country: [auto-filled, default US]

[Also saves to simple address field for compatibility]
```

### User Flow

1. User starts typing address in autocomplete field
2. Google Places shows suggestions
3. User selects address
4. Structured fields auto-populate
5. Text field also populated (for compatibility)
6. User can edit any field manually
7. On save, both structured and text fields saved

---

## 📝 Implementation Steps

### Step 1: Database Migration
1. Create migration SQL file
2. Run migration in Supabase
3. Verify new columns exist

### Step 2: Backend Updates
1. Update `models.py` with new address fields
2. Create `format_address_for_stripe()` function
3. Update `stripe_service.py` to use address
4. Test address formatting

### Step 3: Google Places Setup
1. Get Google Places API key
2. Add to frontend `.env`
3. Install `@react-google-maps/api`
4. Set up API key in component

### Step 4: Frontend Component
1. Create `AddressInput.tsx` component
2. Implement Google Places autocomplete
3. Add structured fields
4. Add mode toggle
5. Handle address selection and field population

### Step 5: Update Client Form
1. Integrate `AddressInput` component
2. Update form state management
3. Update API calls to include new fields
4. Test create/update flows

### Step 6: Testing
1. Test address autocomplete
2. Test structured address saving
3. Test Stripe customer creation with address
4. Test invoice creation with address
5. Test backward compatibility (text-only addresses)

### Step 7: Documentation
1. Update setup guide with Google Places API key
2. Document address input usage
3. Update user guide if needed

---

## 🔐 Security & API Key Management

### Google Places API Key

**Development:**
- Add to `frontend/.env`: `VITE_GOOGLE_PLACES_API_KEY=your_key_here`
- No restrictions needed for local dev

**Production:**
- Add to Vercel environment variables
- Restrict API key in Google Cloud Console:
  - HTTP referrer restrictions
  - Limit to your Vercel domain(s)
  - Enable only "Places API"

**Costs:**
- Google Places API has free tier: $200/month credit
- Autocomplete: $2.83 per 1000 requests
- Usually well within free tier for small-medium apps

---

## ✅ Success Criteria

1. ✅ Users can enter address via autocomplete
2. ✅ Structured address fields auto-populate
3. ✅ Address transfers to Stripe customer
4. ✅ Address appears on Stripe invoices
5. ✅ Backward compatible with existing text addresses
6. ✅ Users can toggle between simple/structured modes
7. ✅ Manual editing of address fields works

---

## 🚀 Estimated Implementation Time

- **Database Migration**: 15 minutes
- **Backend Updates**: 1-2 hours
- **Google Places Setup**: 30 minutes
- **Frontend Component**: 2-3 hours
- **Integration & Testing**: 1-2 hours
- **Documentation**: 30 minutes

**Total**: ~5-8 hours

---

## 📋 Pre-Implementation Checklist

Before starting:
- [ ] Get Google Places API key
- [ ] Enable Places API in Google Cloud Console
- [ ] Decide on API key restrictions
- [ ] Review current address data structure
- [ ] Plan migration for existing addresses (if needed)

---

## 🎯 Next Steps After Approval

1. Get Google Places API key from user
2. Create database migration
3. Update backend models and Stripe service
4. Install frontend dependencies
5. Create AddressInput component
6. Integrate into client form
7. Test end-to-end flow
8. Deploy and verify

---

**Ready to proceed once approved!** 🚀

