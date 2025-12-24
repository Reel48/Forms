# Streaming Debug Guide

## Overview

I've added comprehensive debugging to help identify why the streaming message is showing blank. The streaming system should work as follows:

### Expected Flow

1. **User sends message** → Frontend creates empty streaming message
2. **Backend streams chunks** → Sends SSE events: `data: {"delta": "text chunk"}\n\n`
3. **Frontend parses chunks** → Extracts `delta` from JSON
4. **Frontend updates UI** → Accumulates chunks and updates message in real-time
5. **Streaming completes** → Backend saves final message, Realtime delivers it

### What I Added

1. **Console Logging in `CustomerChatPage.tsx`**:
   - Logs when streaming starts
   - Logs each chunk received (with preview)
   - Logs accumulated content length
   - Logs when message is updated in state
   - Logs when streaming completes

2. **Console Logging in `streaming.ts`**:
   - Logs raw SSE data received
   - Logs parsed JSON data
   - Logs extracted delta content
   - Logs any parsing errors

## How to Debug

### Step 1: Open Browser Console
- Open DevTools (F12 or Cmd+Option+I)
- Go to Console tab
- Clear the console

### Step 2: Send a Test Message
- Send a message to the AI chatbot
- Watch the console for logs

### Step 3: Check the Logs

Look for these log patterns:

**Expected logs:**
```
[STREAMING] Starting to process stream...
[STREAMING PARSER] Parsed SSE data: {delta: "Hello"}
[STREAMING PARSER] Extracted delta content: {deltaContent: "Hello", ...}
[STREAMING] Chunk 1: "Hello" | Accumulated: 5 chars | Preview: "Hello"
[STREAMING] Updated message in state. Message found: true
```

**If you see errors:**
- `[STREAMING PARSER] Error extracting delta` → SSE format issue
- `Streaming error:` → Backend error
- No chunks received → Backend not streaming or connection issue

### Step 4: Check Network Tab

1. Open Network tab in DevTools
2. Filter by "EventStream" or "ai-response-stream"
3. Click on the streaming request
4. Go to "Response" or "Preview" tab
5. You should see:
   ```
   data: {"delta": "Hello"}
   
   data: {"delta": " there"}
   
   data: [DONE]
   
   ```

### Step 5: Common Issues

**Issue 1: No chunks received**
- Check if backend is actually streaming
- Check if SSE connection is established
- Check backend logs for errors

**Issue 2: Chunks received but message not updating**
- Check if `setMessages` is being called
- Check if message ID matches
- Check React DevTools to see if state is updating

**Issue 3: Delta is empty**
- Check if backend is sending correct format
- Check if `parsedData.delta` exists
- Check if JSON parsing is working

**Issue 4: Message shows but is blank**
- Check if `accumulatedContent` has content
- Check if message update is working
- Check if message is being filtered out

## Next Steps

1. **Run the test** and share the console logs
2. **Check Network tab** and share the SSE response format
3. **Check backend logs** for any errors
4. Based on the logs, we can identify the exact issue and fix it

## Files Modified

- `frontend/src/pages/CustomerChatPage.tsx` - Added streaming debug logs
- `frontend/src/lib/streaming.ts` - Added parser debug logs
- `STREAMING_OVERVIEW.md` - Created overview document

