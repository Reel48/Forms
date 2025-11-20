# AI Service Prompt Improvement Suggestions

## Current Issues Identified

1. **Redundancy**: Validation rules repeated 4+ times across different sections
2. **Structure**: Critical rules buried in middle sections
3. **Priority**: Most important rules not emphasized enough
4. **Clarity**: Some instructions could be more explicit

## Recommended Improvements

### 1. Restructure with Priority-Based Organization

**Suggested Order:**
1. Core Identity & Role (what you are)
2. CRITICAL RULES (must-do's, cannot-do's) - at the top
3. Communication Style
4. Function Calling Rules (only if enabled)
5. Context Usage Instructions

### 2. Consolidate Validation Rules

Instead of repeating validation 4 times, create ONE clear section:

```
**MANDATORY PRE-FUNCTION VALIDATION (READ THIS FIRST):**
Before calling ANY function, especially create_quote:
1. ✅ Check knowledge base context - does it say we offer this product?
2. ❌ If context says "we do not sell [X]" or "we don't offer [X]" → DO NOT create quote
3. ✅ Verify product is in our line: Reel48 custom hats OR Reel48 custom coozies
4. ❌ If product not in our line → Explain what we DO offer, don't create quote
5. ✅ Ensure you have ALL required details: description, quantity, unit_price
```

### 3. Use Decision Tree Format

Make validation a clear decision tree:

```
DECISION TREE FOR create_quote:
┌─ Customer wants quote?
│  ├─ NO → Just answer question, don't call function
│  └─ YES → Continue
│     ├─ Product details provided? (description, quantity, price)
│     │  ├─ NO → Ask for details first, don't create quote
│     │  └─ YES → Continue
│     │     ├─ Product in knowledge base as something we offer?
│     │     │  ├─ NO → Explain what we offer, don't create quote
│     │     │  └─ YES → Continue
│     │     │     ├─ Knowledge base says we DON'T sell it?
│     │     │     │  ├─ YES → Explain we make similar products in-house, don't create quote
│     │     │     │  └─ NO → ✅ Safe to create quote
```

### 4. Strengthen Context Instructions

Current: "BEFORE calling ANY function, you MUST check this context"

Better: 
```
**CONTEXT IS YOUR SOURCE OF TRUTH:**
- This context contains authoritative information about what Reel48 offers
- If context says "we do not sell X" → That is FINAL, do not create quote for X
- If context doesn't mention a product → Assume we don't offer it unless it's clearly a hat/coozie
- When in doubt between context and customer request → Trust the context
```

### 5. Add Examples of Good vs Bad Behavior

```
GOOD ✅:
Customer: "Can I get 200 Richardson hats?"
AI: "We don't sell Richardson hats directly, but we can create 200 Reel48 custom hats with similar styling. Would you like a quote for Reel48 custom hats?"

BAD ❌:
Customer: "Can I get 200 Richardson hats?"
AI: [Calls create_quote with "Richardson hats" in description]
```

### 6. Simplify and Consolidate

Current prompt: ~120 lines with lots of repetition
Suggested: ~80 lines with clear hierarchy

### 7. Use Formatting for Emphasis

- Use **BOLD** for critical rules
- Use ❌ for things NOT to do
- Use ✅ for things TO do
- Use numbered lists for sequential steps
- Use bullet points for parallel items

### 8. Add Explicit Error Prevention

```
COMMON MISTAKES TO AVOID:
❌ Creating quotes for products we don't sell (Richardson, Yupoong, etc.)
❌ Creating quotes without checking knowledge base first
❌ Creating quotes when customer just asks "what's the price?"
❌ Creating duplicate quotes in same conversation
✅ Always check context before create_quote
✅ Always explain what you're doing when using functions
✅ Always verify product is in our line before creating quote
```

## Implementation Priority

1. **HIGH**: Consolidate validation rules (remove redundancy)
2. **HIGH**: Move critical rules to top
3. **MEDIUM**: Add decision tree or clearer flow
4. **MEDIUM**: Add good/bad examples
5. **LOW**: Improve formatting (nice to have)

## Testing After Changes

Test scenarios:
1. Customer asks for Richardson hats → Should NOT create quote
2. Customer asks for custom hats → Should create quote
3. Customer asks "what's the price?" → Should NOT create quote
4. Customer asks for quote without details → Should ask for details first

