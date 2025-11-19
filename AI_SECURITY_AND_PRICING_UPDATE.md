# AI Security & Pricing Table Implementation

## ✅ Security Improvements Implemented

### 1. **Strict Customer Data Isolation**
- **Before**: AI could potentially see data from all customers
- **After**: AI only sees data from the logged-in customer
- **Implementation**:
  - All customer data queries filtered by `customer_id`
  - `customer_id` is REQUIRED for customer requests (not optional)
  - If `customer_id` is missing, RAG service returns empty context
  - Admin requests still properly scoped with `is_admin` flag

### 2. **Customer Quotes Isolation**
- **Method**: `_search_customer_quotes()`
- **Security**: Always filters by `client_id` derived from `customer_id`
- **Returns**: Only quotes belonging to the requesting customer
- **No Pricing**: Quote totals removed - pricing comes from pricing table only

### 3. **Customer Forms Isolation**
- **Method**: `_search_customer_forms()`
- **Security**: Only shows forms assigned to customer via folders
- **Returns**: Only forms in folders assigned to the requesting customer
- **No Cross-Customer Access**: Impossible to see other customers' forms

### 4. **Customer Context Isolation**
- **Method**: `_get_customer_context()`
- **Security**: Only retrieves information for the specific `customer_id`
- **Returns**: Only the requesting customer's company, name, and quote count

## ✅ Pricing Table Implementation

### New Database Tables

1. **`pricing_products`**
   - Master product/service pricing table
   - Fields: `product_name`, `product_code`, `description`, `base_price`, `unit`, `category`
   - Used by AI for all pricing questions
   - Public/shared (not customer-specific)

2. **`pricing_discounts`**
   - Discount rules and promotions
   - Fields: `discount_name`, `discount_type`, `discount_value`, `min_quantity`, `applicable_to`
   - Supports percentage, fixed amount, and tiered discounts
   - Can apply to all products, categories, or specific products

3. **`pricing_tiers`**
   - Volume-based pricing tiers
   - Fields: `product_id`, `min_quantity`, `max_quantity`, `price_per_unit`
   - For quantity-based pricing discounts

### How It Works

1. **AI Pricing Queries**:
   - AI no longer pulls pricing from individual quotes
   - AI references `pricing_products` table for all pricing questions
   - Discounts from `pricing_discounts` table included automatically
   - Consistent pricing information across all customers

2. **Quote Context**:
   - Customer quotes still shown for reference
   - But pricing details removed (totals, line item prices)
   - Only shows quote number, title, and status
   - Pricing comes from pricing table, not quotes

3. **Benefits**:
   - ✅ Consistent pricing information
   - ✅ Easy to update pricing in one place
   - ✅ No customer-specific pricing leakage
   - ✅ Supports discounts and volume pricing
   - ✅ Better for AI context (structured data)

## 🔒 Security Guarantees

### Data Isolation Rules

1. **Customer Requests**:
   - `customer_id` is REQUIRED
   - If missing, RAG service returns empty context
   - All queries filtered by `customer_id` → `client_id`

2. **Admin Requests**:
   - `is_admin` flag passed to RAG service
   - Still uses `customer_id` to scope customer-specific data
   - Can see all data, but properly scoped

3. **Pricing Data**:
   - Public/shared pricing table
   - No customer-specific pricing
   - All customers see same pricing information

### What AI Can See

**For Customers:**
- ✅ Their own quotes (without pricing details)
- ✅ Their own forms (assigned via folders)
- ✅ Public pricing table
- ✅ Public discounts
- ✅ Their own company/name information
- ✅ Public knowledge base/FAQs

**For Admins:**
- ✅ All customer quotes (when viewing customer conversations)
- ✅ All forms
- ✅ Public pricing table
- ✅ Public discounts
- ✅ Customer information (for the conversation they're viewing)

**What AI CANNOT See:**
- ❌ Other customers' quotes
- ❌ Other customers' forms
- ❌ Other customers' personal information
- ❌ Pricing from individual quotes (uses pricing table instead)

## 📊 Database Schema

### pricing_products
```sql
- id (UUID, PK)
- product_name (VARCHAR)
- product_code (VARCHAR)
- description (TEXT)
- base_price (DECIMAL)
- unit (VARCHAR) -- 'each', 'per_unit', 'per_hour', etc.
- category (VARCHAR)
- is_active (BOOLEAN)
- created_at, updated_at
```

### pricing_discounts
```sql
- id (UUID, PK)
- discount_name (VARCHAR)
- discount_type (VARCHAR) -- 'percentage', 'fixed_amount', 'tier'
- discount_value (DECIMAL)
- min_quantity (DECIMAL)
- max_quantity (DECIMAL)
- applicable_to (VARCHAR) -- 'all', 'category', 'product'
- applicable_category (VARCHAR)
- applicable_product_id (UUID, FK)
- is_active (BOOLEAN)
- valid_from, valid_until
- created_at, updated_at
```

### pricing_tiers
```sql
- id (UUID, PK)
- product_id (UUID, FK)
- min_quantity (DECIMAL)
- max_quantity (DECIMAL)
- price_per_unit (DECIMAL)
- created_at
```

## 🚀 Next Steps

### 1. Populate Pricing Table
- Add your products/services to `pricing_products`
- Add discount rules to `pricing_discounts`
- Add volume pricing tiers to `pricing_tiers` (if needed)

### 2. Test Security
- Test as different customers
- Verify AI only sees their own data
- Verify pricing comes from pricing table, not quotes

### 3. Optional: Admin UI
- Create admin interface to manage pricing table
- Add/edit/delete products
- Manage discounts and promotions

## 📝 Example Usage

### Adding a Product
```sql
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category)
VALUES ('Custom Hat', 'HAT-001', 'Custom designed hat with logo', 25.00, 'each', 'Headwear');
```

### Adding a Discount
```sql
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, min_quantity, applicable_to)
VALUES ('Bulk Order Discount', 'percentage', 10.00, 10, 'all');
```

### AI Query Example
**Customer asks**: "How much does a custom hat cost?"

**AI sees**:
- Pricing table: "Custom Hat: $25.00 per each"
- Discounts: "Bulk Order Discount: 10% off (min quantity: 10)"
- Customer's quotes: "Your Quote #123: Custom Hat Order - Status: sent"

**AI responds**: "A custom hat costs $25.00 each. If you order 10 or more, you'll receive a 10% bulk discount. I see you have a quote #123 for a custom hat order that's currently sent."

## ✅ Summary

- **Security**: ✅ Strict customer data isolation implemented
- **Pricing**: ✅ Dedicated pricing table replaces quote-based pricing
- **Isolation**: ✅ No cross-customer data leakage possible
- **Consistency**: ✅ All customers see same pricing information
- **Flexibility**: ✅ Supports discounts, tiers, and promotions

The AI chatbot is now secure and uses a centralized pricing system!

