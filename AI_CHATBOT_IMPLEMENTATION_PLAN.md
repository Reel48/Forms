# Google Gemini AI Chatbot Implementation Plan

## Difficulty Assessment: **Medium** (3-4 weeks for full implementation)

The implementation is moderately complex but very achievable. The main challenges are:
- Setting up RAG (Retrieval-Augmented Generation) for product/pricing knowledge
- Managing context windows and conversation history
- Handling real-time responses
- Ensuring accurate product/pricing information retrieval

---

## Implementation Approaches

### **Option 1: RAG (Retrieval-Augmented Generation) - RECOMMENDED** ⭐

**Best for:** Making the AI know your products, pricing, quotes, forms, etc.

**How it works:**
1. Store your product/pricing data in a vector database (or use Supabase's pgvector)
2. When user asks a question, search relevant data
3. Inject that data as context into Gemini
4. Gemini answers using your actual data

**Pros:**
- ✅ Always uses current data (no retraining needed)
- ✅ Can answer about specific quotes, forms, clients
- ✅ Easy to update (just update database)
- ✅ Cost-effective (no fine-tuning costs)

**Cons:**
- ⚠️ Requires vector embeddings setup
- ⚠️ Need to chunk and index your data

**Implementation Steps:**
1. Install `google-generativeai` and `pgvector` (or use Supabase's built-in vector support)
2. Create embeddings for: quotes, line items, forms, product descriptions
3. Store embeddings in database
4. On each chat message, search relevant context
5. Send context + conversation history to Gemini
6. Return AI response

---

### **Option 2: Function Calling / Tool Use**

**Best for:** Letting AI perform actions (create quotes, check pricing, etc.)

**How it works:**
1. Define "functions" the AI can call (e.g., `get_quote_pricing`, `search_products`)
2. Gemini decides when to call functions
3. Execute function, return results
4. AI uses results to answer

**Pros:**
- ✅ AI can take actions, not just answer questions
- ✅ Real-time data access
- ✅ Can create quotes, check inventory, etc.

**Cons:**
- ⚠️ More complex to implement
- ⚠️ Need to handle function execution securely

---

### **Option 3: Fine-tuning (NOT RECOMMENDED)**

**Why not:** 
- Expensive
- Requires retraining when data changes
- Overkill for your use case

---

## Recommended Architecture: **Hybrid RAG + Function Calling**

Combine both approaches for maximum value:

### Phase 1: Basic RAG (Week 1-2)
- Set up vector embeddings for product/pricing data
- Implement context retrieval
- Basic Q&A about products, pricing, quotes

### Phase 2: Function Calling (Week 3-4)
- Add functions: `get_quote_details`, `create_quote`, `search_forms`
- Let AI perform actions on behalf of users
- Enhanced value-add features

---

## Data to Include in Knowledge Base

### **Product/Pricing Information:**
```python
# From your database:
- Line items (description, unit_price, quantity)
- Quote templates
- Line item templates
- Product categories
- Pricing tiers/discounts
```

### **Business Context:**
```python
- Company settings
- Terms and conditions
- Common questions/FAQs
- Form descriptions
- Folder structures
```

### **Customer Context (per conversation):**
```python
- Customer's quotes
- Customer's forms
- Customer's files
- Order history
```

---

## Implementation Details

### 1. Backend Setup

**Install dependencies:**
```bash
pip install google-generativeai pgvector supabase
```

**Create new router:** `backend/routers/ai_chat.py`

**Key functions:**
- `generate_ai_response()` - Main AI response generation
- `retrieve_relevant_context()` - RAG context retrieval
- `execute_function_call()` - Handle function calling
- `get_customer_context()` - Get customer-specific data

### 2. Vector Embeddings Setup

**Option A: Use Supabase pgvector (Recommended)**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE quote_embeddings (
  id UUID PRIMARY KEY,
  quote_id UUID REFERENCES quotes(id),
  content TEXT, -- Quote title, line items, etc.
  embedding vector(768), -- Gemini embedding dimension
  metadata JSONB
);

-- Create index for similarity search
CREATE INDEX ON quote_embeddings USING ivfflat (embedding vector_cosine_ops);
```

**Option B: Use external vector DB (Pinecone, Weaviate)**
- More scalable but adds complexity

### 3. Context Retrieval Strategy

```python
async def retrieve_relevant_context(user_query: str, customer_id: str = None):
    """
    Retrieve relevant context for AI response
    """
    # 1. Generate embedding for user query
    query_embedding = generate_embedding(user_query)
    
    # 2. Search similar quotes/products
    similar_quotes = search_quote_embeddings(query_embedding, limit=5)
    
    # 3. Get customer-specific data if available
    if customer_id:
        customer_quotes = get_customer_quotes(customer_id)
        customer_forms = get_customer_forms(customer_id)
    
    # 4. Format context for Gemini
    context = format_context(similar_quotes, customer_quotes, customer_forms)
    
    return context
```

### 4. Gemini Integration

```python
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel('gemini-pro')

async def generate_ai_response(
    user_message: str,
    conversation_history: List[dict],
    context: str,
    customer_id: str = None
):
    """
    Generate AI response with context
    """
    # Build system prompt with context
    system_prompt = f"""
    You are a helpful assistant for a business that creates custom forms, quotes, and manages client projects.
    
    Context about products and pricing:
    {context}
    
    You can help customers with:
    - Questions about quotes and pricing
    - Information about forms and submissions
    - General questions about services
    - Creating new quotes (if authorized)
    
    Be friendly, professional, and accurate. If you don't know something, say so.
    """
    
    # Build conversation
    messages = [
        {"role": "user", "parts": [system_prompt]},
        *conversation_history,
        {"role": "user", "parts": [user_message]}
    ]
    
    # Generate response
    response = model.generate_content(messages)
    
    return response.text
```

### 5. Function Calling (Advanced)

```python
# Define available functions
AVAILABLE_FUNCTIONS = {
    "get_quote_details": {
        "description": "Get details of a specific quote by ID",
        "parameters": {
            "quote_id": {"type": "string", "description": "The quote ID"}
        }
    },
    "create_quote": {
        "description": "Create a new quote for a customer",
        "parameters": {
            "customer_id": {"type": "string"},
            "title": {"type": "string"},
            "line_items": {"type": "array"}
        }
    },
    "search_products": {
        "description": "Search for products or line items",
        "parameters": {
            "query": {"type": "string"}
        }
    }
}

# Use Gemini's function calling
model = genai.GenerativeModel(
    'gemini-pro',
    tools=[AVAILABLE_FUNCTIONS]
)
```

---

## Value-Add Features

### **For Customers:**
1. **Quote Assistance**
   - "What's the price for X?"
   - "Can you create a quote for Y?"
   - "Show me my recent quotes"

2. **Form Help**
   - "What forms do I need to fill out?"
   - "Help me with form X"
   - "Check my form submission status"

3. **General Support**
   - "What are your services?"
   - "How do I upload files?"
   - "What's my order status?"

### **For Admins:**
1. **Quick Insights**
   - "Show me quotes from last week"
   - "Which customers have pending forms?"
   - "What's our average quote value?"

2. **Automation**
   - "Create a quote for customer X with items Y and Z"
   - "Send reminder to customers with incomplete forms"

---

## Security Considerations

1. **API Key Management**
   - Store Gemini API key in environment variables
   - Never expose in frontend

2. **Data Access Control**
   - Only retrieve data user has access to
   - Validate customer_id matches authenticated user
   - Admin-only functions should check role

3. **Rate Limiting**
   - Limit AI requests per user
   - Prevent abuse

4. **Input Validation**
   - Sanitize user inputs
   - Validate function call parameters

---

## Cost Estimation

**Google Gemini Pricing (as of 2024):**
- Gemini Pro: ~$0.0005 per 1K characters input, $0.0015 per 1K characters output
- Average conversation: ~$0.01-0.05 per conversation

**For 1000 conversations/month:**
- Estimated cost: $10-50/month
- Very affordable for the value provided

---

## Implementation Timeline

### **Week 1: Setup & Basic RAG**
- [ ] Install dependencies
- [ ] Set up Gemini API
- [ ] Create embeddings table
- [ ] Generate embeddings for existing quotes/products
- [ ] Basic context retrieval

### **Week 2: Integration**
- [ ] Create AI chat router endpoint
- [ ] Integrate with existing chat system
- [ ] Add AI toggle/indicator in UI
- [ ] Test with sample queries

### **Week 3: Enhancement**
- [ ] Add customer-specific context
- [ ] Improve context retrieval
- [ ] Add error handling
- [ ] Performance optimization

### **Week 4: Function Calling (Optional)**
- [ ] Implement function definitions
- [ ] Add function execution
- [ ] Test quote creation/search
- [ ] Security review

---

## Next Steps

1. **Get Gemini API Key**
   - Sign up at https://makersuite.google.com/app/apikey
   - Add to backend environment variables

2. **Decide on Approach**
   - Start with RAG (recommended)
   - Add function calling later if needed

3. **Choose Vector DB**
   - Supabase pgvector (easiest, already using Supabase)
   - Or external service (Pinecone, Weaviate)

4. **Start Implementation**
   - I can help implement this step-by-step!

---

## Questions to Consider

1. **Should AI respond automatically or only when triggered?**
   - Option A: Auto-respond to customer messages
   - Option B: Only when admin enables "AI Assistant" mode
   - Option C: Separate AI chat button

2. **What data should AI have access to?**
   - All quotes/products? (recommended)
   - Only customer's own data?
   - Public info only?

3. **Should AI be able to create/modify data?**
   - Read-only (safer)
   - Can create quotes (more powerful, needs more security)

4. **Who can use AI?**
   - Customers only?
   - Admins only?
   - Both?

---

Would you like me to start implementing this? I can begin with:
1. Setting up the Gemini API integration
2. Creating the embeddings infrastructure
3. Building the RAG context retrieval system
4. Integrating with your existing chat system

Let me know which approach you prefer and I'll get started!

