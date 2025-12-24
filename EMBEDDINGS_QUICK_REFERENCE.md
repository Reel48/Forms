# Embeddings Quick Reference

## What Are Embeddings?

**Simple Answer:** Numbers that represent the meaning of text, allowing the AI to find relevant information even when customers use different words.

**Example:**
- Customer asks: "When will my order arrive?"
- System finds: Documents about "delivery time", "shipping estimates", "transit duration"
- Even if those documents don't contain the exact words "order arrive"

## Why They Matter

| Without Embeddings | With Embeddings |
|-------------------|-----------------|
| ❌ Only finds exact word matches | ✅ Finds similar meanings |
| ❌ Misses synonyms | ✅ Understands context |
| ❌ Poor results for questions | ✅ Accurate, relevant answers |
| ❌ "shipping" ≠ "delivery" | ✅ "shipping" ≈ "delivery" |

## Three Types in Your System

1. **Knowledge Embeddings** - Company info, policies, FAQs (manual)
2. **Quote Embeddings** - Customer quotes (automatic or manual)
3. **Form Embeddings** - Customer forms (automatic or manual)

## Quick Operations

### Add Knowledge Entry (Manual)

```sql
-- 1. Insert entry
INSERT INTO knowledge_embeddings (
  id, category, title, content, metadata
) VALUES (
  gen_random_uuid(),
  'shipping',  -- Category
  'Shipping Information',  -- Title
  'Standard shipping takes 5-7 business days...',  -- Content
  '{}'::jsonb  -- Optional metadata
);

-- 2. Generate embedding
-- Run: python scripts/populate_embeddings.py --knowledge-only --limit 1
```

### Check Embedding Status

```sql
SELECT 
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  COUNT(*) - COUNT(embedding) as missing
FROM knowledge_embeddings;
```

### Generate Embeddings for Existing Data

```bash
# All data
python scripts/populate_embeddings.py

# Specific types
python scripts/populate_embeddings.py --knowledge-only
python scripts/populate_embeddings.py --quotes-only
python scripts/populate_embeddings.py --forms-only

# Test with limit
python scripts/populate_embeddings.py --knowledge-only --limit 5
```

### Update Existing Entry

```sql
-- 1. Update content
UPDATE knowledge_embeddings
SET content = 'New content here',
    embedding = NULL,  -- Clear old embedding
    updated_at = NOW()
WHERE id = 'entry-id';

-- 2. Regenerate embedding
-- Run: python scripts/populate_embeddings.py --knowledge-only --limit 1
```

## Common Categories for Knowledge Base

- `shipping` - Delivery times, shipping options
- `pricing` - Pricing information, discounts
- `general` - Company info, general FAQs
- `products` - Product details, specifications
- `policies` - Return policy, terms of service
- `support` - How to get help, contact info

## Best Practices

✅ **Do:**
- Use clear, descriptive titles
- Include full context in content
- Keep content concise but complete
- Use consistent categories
- Update embeddings when content changes

❌ **Don't:**
- Use vague titles
- Include customer-specific info in knowledge base
- Forget to regenerate embeddings after updates
- Duplicate information

## Example: Adding Shipping Info

```sql
INSERT INTO knowledge_embeddings (
  id, category, title, content, metadata
) VALUES (
  gen_random_uuid(),
  'shipping',
  'Shipping Timeframes',
  'Standard shipping: 5-7 business days. Express: 2-3 business days. International: 10-14 business days.',
  '{"source": "shipping_policy"}'::jsonb
);
```

Then run: `python scripts/populate_embeddings.py --knowledge-only --limit 1`

## Troubleshooting

**No embeddings generating?**
- Check `GEMINI_API_KEY` is set
- Verify API key has embedding access
- Check Google Cloud Console for quotas

**Vector search returns empty?**
- Verify embeddings exist: `SELECT COUNT(*) FROM knowledge_embeddings WHERE embedding IS NOT NULL;`
- Check functions exist: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE 'rag_search%';`

**Poor search results?**
- Add more detailed content
- Use clear, descriptive titles
- Include synonyms in content

## Full Documentation

See `EMBEDDINGS_GUIDE.md` for complete details.

