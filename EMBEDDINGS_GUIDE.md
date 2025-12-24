# Embeddings Guide: Understanding and Managing AI Context

## What Are Embeddings?

**Embeddings** are numerical representations of text that capture meaning and context. Think of them as a "translation" of words and sentences into a language that computers can understand mathematically.

### Simple Analogy

Imagine you're organizing books in a library:
- **Old way (keyword search)**: Books are organized by exact words in their titles. If you search for "hats", you only find books with the word "hats" in the title.
- **New way (embeddings)**: Books are organized by meaning and topics. If you search for "headwear" or "caps", you'll find books about hats even if they don't contain the exact word "hats".

### Technical Details

- **Dimensions**: Our embeddings use 768 numbers (a 768-dimensional vector)
- **Model**: Google's `text-embedding-004` - trained to understand semantic meaning
- **Storage**: Stored as `vector(768)` in PostgreSQL using the `pgvector` extension
- **Similarity**: Similar meanings = similar numbers = closer in "vector space"

## How Embeddings Improve Your AI Chatbot

### Before Embeddings (Keyword Search)

**Example Query:** "How long does shipping take?"

**What happens:**
1. System searches for exact words: "shipping", "take", "long"
2. Finds documents containing these words
3. May miss relevant content like "delivery time" or "transit duration"
4. Results can be incomplete or irrelevant

**Limitations:**
- ❌ Misses synonyms and related concepts
- ❌ Requires exact word matches
- ❌ Can't understand context or intent
- ❌ Poor results for conversational queries

### After Embeddings (Vector/Semantic Search)

**Example Query:** "How long does shipping take?"

**What happens:**
1. System converts query to embedding (captures meaning)
2. Searches for similar meanings in vector space
3. Finds content about:
   - "delivery time"
   - "transit duration"  
   - "shipping estimates"
   - "order fulfillment timeline"
4. Returns most relevant results based on meaning, not just words

**Benefits:**
- ✅ Understands synonyms and related concepts
- ✅ Captures intent and context
- ✅ Works with conversational queries
- ✅ More accurate and relevant results

### Real-World Impact

**Customer asks:** "When will my order arrive?"

**With embeddings, the AI can find:**
- Shipping policies mentioning delivery times
- Customer-specific quotes with delivery estimates
- Knowledge base articles about shipping
- Related forms or documents about fulfillment

**Without embeddings, the AI might only find:**
- Documents with exact phrase "order arrive"
- Missing relevant shipping information

## How Embeddings Work in Your System

### The RAG (Retrieval-Augmented Generation) Flow

```
1. Customer asks question
   ↓
2. System converts question to embedding
   ↓
3. Searches vector database for similar content
   ↓
4. Retrieves top 5 most relevant pieces of context
   ↓
5. AI uses this context to generate accurate answer
```

### Three Types of Embeddings in Your System

#### 1. Knowledge Embeddings (`knowledge_embeddings`)
**Purpose:** General company information, policies, FAQs

**Content:**
- Company information ("What does Reel48 do?")
- Shipping policies
- Product information
- General FAQs

**Access:** Available to all customers (public knowledge)

#### 2. Quote Embeddings (`quote_embeddings`)
**Purpose:** Customer-specific quote information

**Content:**
- Quote titles and descriptions
- Line items (products, quantities, prices)
- Quote numbers

**Access:** Only visible to the customer who owns the quote (data isolation)

#### 3. Form Embeddings (`form_embeddings`)
**Purpose:** Forms assigned to customers

**Content:**
- Form names
- Form descriptions
- Form purposes

**Access:** Only visible to customers who have access to the form (via folder assignments)

## Adding Content to Embeddings

### Manual: Knowledge Embeddings

Knowledge embeddings are managed through your Supabase `knowledge_embeddings` table. These are for general company information that all customers can access.

#### Option 1: Via Supabase Dashboard (Recommended for One-Off Updates)

1. **Go to Supabase Dashboard** → Table Editor → `knowledge_embeddings`

2. **Add New Entry:**
   ```sql
   INSERT INTO knowledge_embeddings (
     id,
     category,
     title,
     content,
     metadata
   ) VALUES (
     gen_random_uuid(),
     'shipping',  -- Category: shipping, pricing, general, etc.
     'Shipping Timeframes',  -- Title
     'Standard shipping takes 5-7 business days. Express shipping takes 2-3 business days. International shipping takes 10-14 business days.',  -- Content
     '{"source": "manual", "updated_by": "admin"}'::jsonb  -- Optional metadata
   );
   ```

3. **Generate Embedding:**
   After inserting, run the population script to generate the embedding:
   ```bash
   python scripts/populate_embeddings.py --knowledge-only --limit 1
   ```

#### Option 2: Via API/Backend (For Bulk Updates)

Create a script or use your backend to insert knowledge entries:

```python
from database import supabase_storage
from embeddings_service import get_embeddings_service
import uuid

# Add knowledge entry
entry = {
    "id": str(uuid.uuid4()),
    "category": "pricing",
    "title": "Bulk Order Discounts",
    "content": "Orders over 100 units receive a 10% discount. Orders over 500 units receive a 15% discount.",
    "metadata": {"source": "pricing_policy"}
}

# Insert into database
supabase_storage.table("knowledge_embeddings").insert(entry).execute()

# Generate embedding
embeddings_service = get_embeddings_service()
embedding = embeddings_service.generate_embedding(entry["content"])
embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'

# Update with embedding
supabase_storage.table("knowledge_embeddings").update({
    "embedding": embedding_str
}).eq("id", entry["id"]).execute()
```

#### Option 3: Update Existing Entries

To update content and regenerate embeddings:

```sql
-- Update content
UPDATE knowledge_embeddings
SET content = 'New updated content here',
    updated_at = NOW()
WHERE id = 'your-entry-id';

-- Then regenerate embedding via script
```

#### Best Practices for Knowledge Embeddings

✅ **Do:**
- Use clear, descriptive titles
- Include full context in content (don't assume prior knowledge)
- Use consistent categories (shipping, pricing, general, products, etc.)
- Keep content concise but complete
- Update embeddings when content changes

❌ **Don't:**
- Include customer-specific information (use quotes/forms for that)
- Use vague titles like "Info" or "Details"
- Duplicate information across multiple entries
- Forget to regenerate embeddings after updates

### Automatic: Customer Data (Quotes & Forms)

Customer-specific data is automatically embedded when created or updated. The system handles this through your existing workflows.

#### How Quote Embeddings Work

**When a quote is created/updated:**
1. System extracts quote information:
   - Title
   - Quote number
   - Line items (description, quantity, price)

2. Creates content string:
   ```
   Quote: Custom Hats Order
   Quote Number: Q-2024-001
   Line Items: Custom Baseball Cap - Quantity: 500, Price: $15.00; Custom Trucker Hat - Quantity: 200, Price: $18.00
   ```

3. Generates embedding automatically (via background task or on-demand)

4. Stores in `quote_embeddings` table with:
   - Link to quote (`quote_id`)
   - Customer isolation (via `quotes.client_id`)

**To trigger embedding generation:**
```bash
# Generate embeddings for all quotes
python scripts/populate_embeddings.py --quotes-only

# Or it happens automatically when quotes are created (if you add this to your quote creation endpoint)
```

#### How Form Embeddings Work

**When a form is published:**
1. System extracts form information:
   - Form name
   - Form description

2. Creates content string:
   ```
   Form: Customer Onboarding Form
   Description: Collect customer information and preferences for new account setup
   ```

3. Generates embedding automatically

4. Stores in `form_embeddings` table with:
   - Link to form (`form_id`)
   - Customer access via folder assignments

**To trigger embedding generation:**
```bash
# Generate embeddings for all published forms
python scripts/populate_embeddings.py --forms-only
```

#### Automatic Embedding Integration

To make embeddings generate automatically when data is created:

**For Quotes:**
Add to your quote creation/update endpoint in `backend/routers/quotes.py`:

```python
from embeddings_service import get_embeddings_service
import uuid

# After quote is created/updated
if quote_data:
    embeddings_service = get_embeddings_service()
    
    # Build content string
    content_parts = [f"Quote: {quote_data.get('title', '')}"]
    if quote_data.get('quote_number'):
        content_parts.append(f"Quote Number: {quote_data.get('quote_number')}")
    
    # Add line items if available
    if line_items:
        items_summary = []
        for item in line_items:
            items_summary.append(f"{item.get('description', '')} - Quantity: {item.get('quantity', 0)}, Price: ${item.get('unit_price', '0')}")
        content_parts.append("Line Items: " + "; ".join(items_summary))
    
    content = "\n".join(content_parts)
    
    # Generate embedding
    embedding = embeddings_service.generate_embedding(content)
    if embedding:
        embedding_str = '[' + ','.join([str(float(x)) for x in embedding]) + ']'
        
        # Store embedding
        supabase_storage.table("quote_embeddings").upsert({
            "id": str(uuid.uuid4()),
            "quote_id": quote_id,
            "content_type": "quote",
            "content": content,
            "embedding": embedding_str,
            "metadata": {
                "title": quote_data.get('title'),
                "quote_number": quote_data.get('quote_number')
            }
        }).execute()
```

**For Forms:**
Similar pattern in `backend/routers/forms.py` when forms are published.

## Managing Embeddings

### Check Embedding Status

```sql
-- See what needs embeddings
SELECT 
  'knowledge' as type,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  COUNT(*) - COUNT(embedding) as missing
FROM knowledge_embeddings
UNION ALL
SELECT 
  'quotes' as type,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  COUNT(*) - COUNT(embedding) as missing
FROM quote_embeddings
UNION ALL
SELECT 
  'forms' as type,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  COUNT(*) - COUNT(embedding) as missing
FROM form_embeddings;
```

### Regenerate Embeddings

If you need to regenerate all embeddings (e.g., after changing the embedding model):

```bash
# Regenerate all
python scripts/populate_embeddings.py

# Or specific types
python scripts/populate_embeddings.py --knowledge-only
python scripts/populate_embeddings.py --quotes-only
python scripts/populate_embeddings.py --forms-only
```

### Update Embeddings When Content Changes

**Knowledge Base:**
1. Update content in `knowledge_embeddings` table
2. Set `embedding` to NULL (or delete the row and recreate)
3. Run population script

**Quotes/Forms:**
- If automatic embedding is set up, embeddings update when data changes
- Otherwise, run population script after bulk updates

## Example: Adding Shipping Information

### Step 1: Add to Knowledge Base

```sql
INSERT INTO knowledge_embeddings (
  id,
  category,
  title,
  content,
  metadata
) VALUES (
  gen_random_uuid(),
  'shipping',
  'Shipping and Delivery Information',
  'Standard shipping takes 5-7 business days within the continental United States. Express shipping (2-3 business days) is available for an additional $15. International shipping typically takes 10-14 business days. All orders are processed within 1-2 business days of payment confirmation. Tracking information is provided via email once your order ships.',
  '{"source": "shipping_policy", "last_updated": "2024-12-24"}'::jsonb
);
```

### Step 2: Generate Embedding

```bash
python scripts/populate_embeddings.py --knowledge-only --limit 1
```

### Step 3: Test It

Now when customers ask:
- "How long does shipping take?"
- "When will my order arrive?"
- "What are the delivery options?"

The AI will find this knowledge base entry and provide accurate information!

## Troubleshooting

### Embeddings Not Generating

**Check:**
- `GEMINI_API_KEY` is set correctly
- API key has access to embedding models
- Google Cloud Console for quotas/errors

**Fix:**
```bash
# Verify environment
echo $GEMINI_API_KEY

# Test embedding generation
python3 -c "from backend.embeddings_service import get_embeddings_service; s = get_embeddings_service(); print(s.generate_embedding('test'))"
```

### Vector Search Returns No Results

**Possible causes:**
1. Embeddings don't exist yet → Run population script
2. Embedding format is wrong → Check vector dimension (should be 768)
3. Functions not created → Verify migration ran

**Verify:**
```sql
-- Check if embeddings exist
SELECT COUNT(*) FROM knowledge_embeddings WHERE embedding IS NOT NULL;

-- Test vector search function
SELECT * FROM rag_search_knowledge_embeddings_vector(
  '[0.1,0.2,0.3,...]'::text,  -- Sample embedding
  5
);
```

### Poor Search Results

**Improve by:**
- Adding more detailed content to knowledge entries
- Using clear, descriptive titles
- Including synonyms and related terms in content
- Keeping content up-to-date

## Summary

**Embeddings = Better AI Context**

- ✅ Understand meaning, not just keywords
- ✅ Find relevant information even with different wording
- ✅ Provide more accurate answers to customers
- ✅ Automatically work with customer-specific data (quotes, forms)
- ✅ Easy to add new knowledge manually

**Your System:**
- Knowledge embeddings: Manual management for company info
- Quote embeddings: Automatic (or can be triggered)
- Form embeddings: Automatic (or can be triggered)

**Next Steps:**
1. Populate existing data with embeddings
2. Add knowledge base entries for common questions
3. Set up automatic embedding generation for new quotes/forms
4. Monitor and improve based on customer questions

