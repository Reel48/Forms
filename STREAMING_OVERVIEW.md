# AI Chatbot Streaming Implementation Overview

## How Streaming Should Work

### 1. **User Sends Message**
- User types and sends a message
- Frontend calls `sendMessage()` which saves the message to the database
- After message is sent, frontend calls `streamAIResponse(conversationId)`

### 2. **Frontend Creates Streaming Message**
- Creates a temporary message object with:
  - `id: 'streaming-{timestamp}'`
  - `sender_id: 'ai-streaming'` (temporary)
  - `message: ''` (starts empty)
  - `message_type: 'text'`
- Adds this message to the UI immediately (shows as blank initially)
- Sets `isStreamingRef.current = true` to track streaming state

### 3. **Frontend Fetches Streaming Endpoint**
- Makes GET request to `/api/chat/conversations/{id}/ai-response-stream`
- Expects Server-Sent Events (SSE) response
- Passes response body to `createTextStream()` utility

### 4. **Backend Streams Response**
- Backend calls `ai_service.generate_response_stream()`
- Gemini API streams tokens/chunks
- Backend wraps each chunk in SSE format: `data: {"delta": "chunk text"}\n\n`
- Backend accumulates all chunks
- When done, sends: `data: [DONE]\n\n`
- Backend saves final message to database
- Realtime triggers INSERT event for the final message

### 5. **Frontend Parses SSE Stream**
- `createTextStream()` uses `EventSourceParserStream` to parse SSE events
- Extracts `delta` from JSON: `parsedData.delta`
- Yields `{ done: false, value: deltaContent }` for each chunk
- If chunk is large (>5 chars), splits it into smaller chunks (1-3 chars) for smoother animation

### 6. **Frontend Updates UI in Real-Time**
- For each chunk received:
  - Accumulates: `accumulatedContent += update.value`
  - Updates message: `setMessages(prev => prev.map(msg => msg.id === streamingMessageId ? { ...msg, message: accumulatedContent } : msg))`
  - Auto-scrolls to bottom

### 7. **Streaming Completes**
- When `update.done === true`, streaming is complete
- Frontend keeps streaming message visible with accumulated content
- Sets timeout (3 seconds) to wait for Realtime to deliver final message

### 8. **Realtime Delivers Final Message**
- Realtime INSERT handler receives the final message from database
- Checks if it's an AI message (`sender_id !== user?.id`)
- If streaming message exists, replaces it with the real message
- Removes streaming message from UI

### 9. **Fallback**
- If Realtime doesn't deliver within 3 seconds:
  - Keep the streaming message (it has the full content)
  - User still sees the complete response

## Current Issue: Blank Message

The streaming message is showing blank, which means:
- Either chunks aren't being received from backend
- Or chunks aren't being parsed correctly
- Or message updates aren't triggering re-renders
- Or there's an error in the stream processing

## Debugging Steps

1. **Check Browser Console**
   - Look for errors in `createTextStream` or `streamAIResponse`
   - Check if SSE events are being received
   - Check if `update.value` has content

2. **Check Network Tab**
   - Verify the streaming request is successful (200 status)
   - Check if SSE events are coming through
   - Look at the response format: should be `data: {"delta": "text"}\n\n`

3. **Check Backend Logs**
   - Verify `generate_response_stream` is being called
   - Check if Gemini is returning chunks
   - Verify SSE format is correct

4. **Add Console Logs**
   - Log when chunks are received
   - Log accumulated content
   - Log message updates

## Expected SSE Format

Backend should send:
```
data: {"delta": "Hello"}\n\n
data: {"delta": " there"}\n\n
data: {"delta": "!"}\n\n
data: [DONE]\n\n
```

Frontend should parse:
- Extract `delta` from JSON
- Accumulate: "Hello" + " there" + "!" = "Hello there!"
- Update message in real-time

