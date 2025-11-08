# Address Transfer to Stripe - Options & Recommendations

## Current Situation

- **Current Storage**: Single `address` TEXT field in clients table
- **Stripe Requirement**: Structured address with separate fields (line1, line2, city, state, postal_code, country)
- **Challenge**: Need to convert free-form text address to Stripe's structured format

## Option 1: Parse Free-Form Text Address (Simplest) ⭐ Recommended

**Approach:**
- Keep current single text field
- Use address parsing library to extract structured components
- Fallback to putting entire address in `line1` if parsing fails

**Pros:**
- ✅ No UI changes needed
- ✅ Works with existing data
- ✅ Quick to implement
- ✅ Users can paste addresses from anywhere

**Cons:**
- ⚠️ Parsing may not be 100% accurate
- ⚠️ International addresses harder to parse

**Implementation:**
```python
# Use library like `usaddress` (US) or `pyap` (international)
# Or simple regex-based parsing
# Fallback: put entire address in line1
```

**Stripe Fields:**
- `customer.address.line1` - Full address or street
- `customer.address.city` - Parsed or empty
- `customer.address.state` - Parsed or empty
- `customer.address.postal_code` - Parsed or empty
- `customer.address.country` - Default to "US" or detect

---

## Option 2: Structured Address Fields (Most Accurate)

**Approach:**
- Replace single text field with separate input fields:
  - Street Address (line1)
  - Address Line 2 (optional)
  - City
  - State/Province
  - ZIP/Postal Code
  - Country

**Pros:**
- ✅ 100% accurate address data
- ✅ Perfect Stripe integration
- ✅ Better for international addresses
- ✅ Professional appearance

**Cons:**
- ⚠️ Requires UI changes
- ⚠️ Need to migrate existing data
- ⚠️ More form fields (slightly more work for users)

**Implementation:**
- Update database schema (add city, state, postal_code, country columns)
- Update client form with separate fields
- Direct mapping to Stripe address structure

---

## Option 3: Hybrid Approach (Best of Both Worlds) ⭐⭐ Best Option

**Approach:**
- Keep single text field as primary
- Add optional structured fields that auto-populate if provided
- If structured fields exist, use those; otherwise parse text field

**Pros:**
- ✅ Works with existing data immediately
- ✅ Allows gradual improvement
- ✅ Users can use simple text OR structured fields
- ✅ Best accuracy when structured fields used

**Cons:**
- ⚠️ More complex implementation
- ⚠️ Slightly more UI elements

**Implementation:**
- Keep `address` TEXT field
- Add optional fields: `address_line1`, `address_city`, `address_state`, `address_postal_code`, `address_country`
- UI: Text field with "Advanced" toggle to show structured fields
- Logic: Use structured if available, else parse text

---

## Option 4: Address Autocomplete (Most User-Friendly)

**Approach:**
- Use Google Places API or similar for address autocomplete
- Single text field with autocomplete dropdown
- Auto-fills structured fields behind the scenes

**Pros:**
- ✅ Best user experience
- ✅ Accurate structured data
- ✅ Fast address entry
- ✅ Validates addresses

**Cons:**
- ⚠️ Requires API key (Google Places, etc.)
- ⚠️ May have costs
- ⚠️ More complex setup

**Implementation:**
- Integrate Google Places Autocomplete
- Store both text and structured fields
- Use structured for Stripe

---

## Recommendation: Option 3 (Hybrid) or Option 1 (Simple)

### For Quick Implementation: **Option 1**
- Fastest to implement
- Works immediately
- Good enough for most cases

### For Best Long-Term Solution: **Option 3**
- Flexible for users
- Accurate when needed
- Professional appearance

---

## Stripe Address Fields

Stripe supports these address fields on Customer and Invoice:

```python
address = {
    "line1": "123 Main St",        # Required
    "line2": "Apt 4B",             # Optional
    "city": "New York",            # Optional but recommended
    "state": "NY",                 # Optional but recommended
    "postal_code": "10001",        # Optional but recommended
    "country": "US"                # Optional, defaults to account country
}
```

**Where addresses appear:**
- **Customer address**: Used as default billing address
- **Invoice billing address**: Can override customer address
- **Invoice shipping address**: For physical products (if needed)

---

## Implementation Details by Option

### Option 1: Simple Text Parsing

**Backend Changes:**
```python
def parse_address_to_stripe(address_text: str) -> dict:
    """Parse free-form address to Stripe format"""
    if not address_text:
        return {}
    
    # Simple parsing logic
    # Or use library like `usaddress` for US addresses
    # For now, put entire address in line1
    return {
        "line1": address_text,
        "country": "US"  # Default or detect
    }
```

**Stripe Integration:**
```python
# When creating customer
customer_params["address"] = parse_address_to_stripe(client.get("address"))
```

### Option 2: Structured Fields

**Database Migration:**
```sql
ALTER TABLE clients 
ADD COLUMN address_line1 VARCHAR(255),
ADD COLUMN address_line2 VARCHAR(255),
ADD COLUMN address_city VARCHAR(100),
ADD COLUMN address_state VARCHAR(50),
ADD COLUMN address_postal_code VARCHAR(20),
ADD COLUMN address_country VARCHAR(2) DEFAULT 'US';
```

**UI Changes:**
- Replace single address textarea with form fields
- Add validation for required fields

### Option 3: Hybrid

**Database:**
- Keep `address` TEXT field
- Add optional structured fields

**UI:**
- Text field with "Use structured address" toggle
- When toggled, show structured fields
- Auto-populate text field from structured (or vice versa)

---

## My Recommendation

**Start with Option 1** (Simple Text Parsing):
- Quick to implement
- Works with existing data
- Good enough for invoices
- Can upgrade to Option 3 later if needed

**Then upgrade to Option 3** (Hybrid) if you need:
- More accurate addresses
- International address support
- Professional appearance

Which option would you like to go with?

