# Customer-Admin Chat Feature Proposal

## Overview
A direct messaging system between customers and admins (Reel48) to facilitate communication, support, and collaboration.

## Core Features

### 1. **Real-Time Messaging**
- **WebSocket or Server-Sent Events (SSE)**: Real-time message delivery
- **Polling fallback**: For environments where WebSockets aren't available
- **Message delivery confirmation**: Know when messages are sent/received
- **Typing indicators**: Show when someone is typing

### 2. **Message Management**
- **Message history**: Persistent chat history per customer
- **Search functionality**: Search through message history
- **Message timestamps**: Show when messages were sent
- **Read receipts**: Indicate when messages have been read
- **Message status**: Sent, Delivered, Read indicators

### 3. **Admin Features**
- **Multi-customer chat list**: View all active conversations
- **Unread message counts**: Badge showing unread messages per customer
- **Chat assignment**: Assign specific chats to team members (future)
- **Chat status**: Active, Resolved, Archived
- **Quick filters**: Filter by unread, active, resolved, etc.
- **Customer context**: Show customer info (name, email, folders) in chat sidebar

### 4. **Customer Features**
- **Single chat interface**: Customers only chat with "Reel48" (company)
- **Chat widget**: Fixed or collapsible chat box on dashboard
- **Notification badges**: Show unread message count
- **Message history**: Access to previous conversations
- **File attachments**: Upload files/images in chat (optional)

### 5. **Enhanced Features (Nice to Have)**
- **Message templates**: Pre-written responses for common questions
- **Auto-responses**: Automated replies for after-hours
- **Chat tags/categories**: Tag conversations (Support, Billing, Technical, etc.)
- **Priority flags**: Mark urgent conversations
- **Chat transcripts**: Export conversation history
- **Rich text formatting**: Bold, italic, links, code blocks
- **Emoji support**: Add emojis to messages
- **File sharing**: Share files directly in chat
- **Screenshot sharing**: Quick image uploads
- **Voice messages**: Audio message support (future)

### 6. **Notifications**
- **Browser notifications**: Desktop notifications for new messages
- **Email notifications**: Optional email alerts for admins
- **In-app notifications**: Toast notifications or badge counts
- **Sound alerts**: Optional sound for new messages

### 7. **Integration Features**
- **Folder context**: Link chats to specific folders/projects
- **Quote context**: Reference quotes in chat
- **Form context**: Reference forms in chat
- **Activity timeline**: Show chat activity in folder/quote history

## Technical Implementation Ideas

### Database Schema
```sql
-- Chat conversations
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES auth.users(id),
  admin_id UUID REFERENCES auth.users(id), -- Optional: assigned admin
  folder_id UUID REFERENCES folders(id), -- Optional: linked to folder
  status VARCHAR(50), -- active, resolved, archived
  last_message_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES chat_conversations(id),
  sender_id UUID REFERENCES auth.users(id),
  message TEXT,
  message_type VARCHAR(50), -- text, file, image, system
  file_url TEXT, -- For attachments
  read_at TIMESTAMP, -- When message was read
  created_at TIMESTAMP
);

-- Chat participants (for future multi-admin support)
CREATE TABLE chat_participants (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES chat_conversations(id),
  user_id UUID REFERENCES auth.users(id),
  role VARCHAR(50), -- customer, admin
  joined_at TIMESTAMP
);
```

### Real-Time Options
1. **Supabase Realtime**: Use Supabase's built-in realtime subscriptions
2. **WebSockets**: Custom WebSocket server (more control, more complex)
3. **Server-Sent Events (SSE)**: Simpler than WebSockets, one-way from server
4. **Polling**: Simple HTTP polling (easiest, less efficient)

### UI/UX Ideas

#### Customer Side (Dashboard)
- **Fixed chat widget**: Bottom-right corner, always accessible
- **Collapsible chat box**: Can minimize/maximize
- **Chat history**: Scrollable message list
- **Input area**: Text input with send button
- **Status indicator**: "Reel48 is online" / "Reel48 is offline"
- **Unread badge**: Red dot with count on chat icon

#### Admin Side (Chat Page)
- **Two-panel layout**: 
  - Left: List of conversations (customers)
  - Right: Active conversation view
- **Conversation list items**:
  - Customer name/email
  - Last message preview
  - Timestamp
  - Unread badge
  - Status indicator (online/offline)
- **Active conversation view**:
  - Customer info header
  - Message thread
  - Input area
  - File upload button
  - Quick actions (resolve, archive, etc.)

## Implementation Phases

### Phase 1: Basic Chat (MVP)
- ✅ Database schema
- ✅ Backend API endpoints (send message, get messages, get conversations)
- ✅ Customer chat widget on dashboard
- ✅ Admin chat page with conversation list
- ✅ Basic real-time updates (polling or Supabase Realtime)
- ✅ Message history

### Phase 2: Enhanced Features
- ✅ Read receipts
- ✅ Typing indicators
- ✅ Unread message counts
- ✅ Status indicators (online/offline)
- ✅ File attachments
- ✅ Search functionality

### Phase 3: Advanced Features
- ✅ Message templates
- ✅ Chat assignment
- ✅ Chat tags/categories
- ✅ Priority flags
- ✅ Browser notifications
- ✅ Folder/quote context linking

## Recommended Approach

**For MVP (Phase 1)**, I recommend:
1. **Supabase Realtime** for real-time messaging (easiest integration)
2. **Simple two-table schema**: `chat_conversations` and `chat_messages`
3. **Customer widget**: Fixed bottom-right chat box on dashboard
4. **Admin page**: Full chat interface in navigation
5. **Polling fallback**: If realtime doesn't work, fall back to polling

This gives you a solid foundation that can be enhanced later.

## Questions to Consider

1. **Should chats be linked to folders?** (e.g., "Chat about Project X")
2. **Do you want file attachments in MVP?** (adds complexity)
3. **Should there be multiple admins?** (affects assignment logic)
4. **Do you want message templates?** (saves time for common responses)
5. **Should chats auto-resolve?** (after X days of inactivity)
6. **Do you want email notifications?** (for admins when customer messages)

## Next Steps

Once you decide on the features, I can:
1. Create the database migration
2. Build the backend API endpoints
3. Implement the customer chat widget
4. Build the admin chat interface
5. Add real-time functionality
6. Test and deploy

Let me know which features are most important to you, and we can start implementing!

