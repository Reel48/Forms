import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatConversation, type ChatMessage } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaCheck } from 'react-icons/fa';
import './ChatPage.css';

const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);
  const notificationPermissionRequested = useRef(false);

  // Setup Realtime subscriptions for messages and conversations
  const setupRealtimeSubscriptions = useCallback(async (conversationId: string) => {
    // Get Realtime client (uses service role key if available, otherwise anon key)
    const realtimeClient = getRealtimeClient();

    // Clean up existing subscriptions
    if (messagesSubscriptionRef.current) {
      realtimeClient.removeChannel(messagesSubscriptionRef.current);
      messagesSubscriptionRef.current = null;
    }
    if (conversationsSubscriptionRef.current) {
      realtimeClient.removeChannel(conversationsSubscriptionRef.current);
      conversationsSubscriptionRef.current = null;
    }

    // Subscribe to new messages in this conversation
    const messagesChannel = realtimeClient
      .channel(`chat_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('Realtime message event:', payload.eventType, payload);
          
          if (payload.eventType === 'INSERT') {
            // New message received
            const newMessage = payload.new as ChatMessage;
            setMessages((prev) => {
              // Check if message already exists to avoid duplicates
              if (prev.some((msg) => msg.id === newMessage.id)) {
                return prev;
              }
              // Only add if it's newer than the newest message we have, or if we're at the bottom
              const newestMessage = prev[prev.length - 1];
              if (!newestMessage || new Date(newMessage.created_at) >= new Date(newestMessage.created_at)) {
                // New message is at the end, enable auto-scroll
                setShouldAutoScroll(true);
                return [...prev, newMessage];
              }
              // Message is older, might be from loading more - don't add it
              return prev;
            });
            // Update conversations list to refresh unread counts and last_message_at
            // Only reload if this is not the currently selected conversation (to avoid flicker)
            if (selectedConversation?.id !== newMessage.conversation_id) {
              loadConversations();
              // Show notification for messages in other conversations
              const conversation = conversations.find(c => c.id === newMessage.conversation_id);
              showNotification(newMessage, conversation?.customer_name || conversation?.customer_email || undefined);
            } else {
              // For current conversation, just update the conversation's last_message_at in state
              setConversations((prev) =>
                prev.map((conv) =>
                  conv.id === newMessage.conversation_id
                    ? { ...conv, last_message_at: newMessage.created_at }
                    : conv
                )
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            // Message updated (e.g., read_at changed)
            const updatedMessage = payload.new as ChatMessage;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updatedMessage.id ? updatedMessage : msg))
            );
          } else if (payload.eventType === 'DELETE') {
            // Message deleted
            const deletedMessage = payload.old as ChatMessage;
            setMessages((prev) => prev.filter((msg) => msg.id !== deletedMessage.id));
          }
        }
      )
      .subscribe((status) => {
        console.log('📨 Messages subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to chat messages via Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to chat messages:', status);
          console.error('💡 Check: Is VITE_SUPABASE_SERVICE_ROLE_KEY set in Vercel?');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Realtime subscription timed out, will retry');
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime subscription closed');
        }
      });

    messagesSubscriptionRef.current = messagesChannel;

    // Subscribe to conversation updates (for unread counts, last_message_at, etc.)
    const conversationsChannel = realtimeClient
      .channel(`chat_conversations:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('Realtime conversation event:', payload);
          // Reload conversations to get updated data
          loadConversations();
        }
      )
      .subscribe((status) => {
        console.log('💬 Conversations subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to chat conversations via Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to chat conversations:', status);
          console.error('💡 Check: Is VITE_SUPABASE_SERVICE_ROLE_KEY set in Vercel?');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Realtime subscription timed out, will retry');
        } else if (status === 'CLOSED') {
          console.warn('🔌 Realtime subscription closed');
        }
      });

    conversationsSubscriptionRef.current = conversationsChannel;
  }, [user?.id]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default' && !notificationPermissionRequested.current) {
      notificationPermissionRequested.current = true;
      await Notification.requestPermission();
    }
  };

  const showNotification = (message: ChatMessage, customerName?: string) => {
    // Only show notification if:
    // 1. Notification permission is granted
    // 2. Message is from someone else (not the current user)
    // 3. This conversation is not currently selected (user is viewing another conversation)
    if (message.sender_id === user?.id) return;
    if (selectedConversation?.id === message.conversation_id) return; // Don't notify if viewing this conversation
    
    if ('Notification' in window && Notification.permission === 'granted') {
      const messagePreview = message.message_type === 'file' || message.message_type === 'image'
        ? `📎 ${message.file_name || 'File'}`
        : message.message.length > 50
        ? message.message.substring(0, 50) + '...'
        : message.message;
      
      const title = customerName 
        ? `New message from ${customerName}`
        : 'New message from customer';
      
      new Notification(title, {
        body: messagePreview,
        icon: '/logo-light.png',
        tag: `chat-${message.conversation_id}`,
        requireInteraction: false,
      });
    }
  };

  useEffect(() => {
    console.log('ChatPage: Loading conversations and setting up Realtime subscriptions');
    loadConversations();
    requestNotificationPermission();

    // Cleanup subscriptions on unmount
    return () => {
      const realtimeClient = getRealtimeClient();
      if (messagesSubscriptionRef.current) {
        realtimeClient.removeChannel(messagesSubscriptionRef.current);
        messagesSubscriptionRef.current = null;
      }
      if (conversationsSubscriptionRef.current) {
        realtimeClient.removeChannel(conversationsSubscriptionRef.current);
        conversationsSubscriptionRef.current = null;
      }
    };
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || loadingMore || !hasMoreMessages) return;
    
    try {
      setLoadingMore(true);
      const oldestMessage = messages[0];
      if (!oldestMessage) return;
      
      const response = await chatAPI.getMessages(selectedConversation.id, 50, oldestMessage.id);
      const olderMessages = response.data;
      
      if (olderMessages.length > 0) {
        // Save current scroll position
        const container = messagesContainerRef.current;
        const previousScrollHeight = container?.scrollHeight || 0;
        
        // Prepend older messages
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMoreMessages(olderMessages.length === 50);
        
        // Restore scroll position after messages are rendered
        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight;
          }
        }, 0);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedConversation?.id, loadingMore, hasMoreMessages, messages]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id, true);
      markAllAsRead(selectedConversation.id);
      setupRealtimeSubscriptions(selectedConversation.id);
      setShouldAutoScroll(true); // Reset auto-scroll when switching conversations
    }
  }, [selectedConversation?.id, setupRealtimeSubscriptions]);

  useEffect(() => {
    // Only auto-scroll if user is near bottom (within 100px) or if shouldAutoScroll is true
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  // Check if user is near bottom of messages container
  const checkIfNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 100; // pixels from bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setShouldAutoScroll(isNearBottom);
    return isNearBottom;
  };

  // Handle scroll events to detect if user is reading old messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIfNearBottom();
      
      // Load more messages when scrolling to top
      if (container.scrollTop === 0 && hasMoreMessages && !loadingMore) {
        loadMoreMessages();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMoreMessages, loadingMore, loadMoreMessages]);

  // Fallback polling: Only poll occasionally as backup (Realtime handles most updates)
  useEffect(() => {
    if (!selectedConversation) return;

    const interval = setInterval(() => {
      if (selectedConversation) {
        // Only poll occasionally as backup - Realtime should handle most updates
        loadConversations();
      }
    }, 30000); // Check every 30 seconds as backup (Realtime handles real-time updates)

    return () => clearInterval(interval);
  }, [selectedConversation?.id]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await chatAPI.getConversations();
      setConversations(response.data);
      if (response.data.length > 0 && !selectedConversation) {
        setSelectedConversation(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string, reset: boolean = true) => {
    try {
      if (reset) {
        setMessages([]);
        setHasMoreMessages(false);
        setShouldAutoScroll(true);
      }
      const response = await chatAPI.getMessages(conversationId, 50);
      const loadedMessages = response.data;
      
      if (reset) {
        setMessages(loadedMessages);
        // If we got 50 messages, there might be more
        setHasMoreMessages(loadedMessages.length === 50);
      } else {
        // Prepend older messages
        setMessages((prev) => [...loadedMessages, ...prev]);
        setHasMoreMessages(loadedMessages.length === 50);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  // NOTE: Realtime subscriptions use service role key (bypasses RLS)
  // Fallback polling runs occasionally as backup

  const markAllAsRead = async (conversationId: string) => {
    try {
      await chatAPI.markAllRead(conversationId);
      // Refresh conversations to update unread counts
      loadConversations();
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    try {
      setSending(true);
      await chatAPI.sendMessage({
        conversation_id: selectedConversation.id,
        message: newMessage.trim(),
      });
      setNewMessage('');
      // Realtime will handle the new message update automatically
      // No need to reload conversations - Realtime subscription will update the UI
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation || uploading) return;

    try {
      setUploading(true);
      const uploadResponse = await chatAPI.uploadFile(file);
      await chatAPI.sendMessage({
        conversation_id: selectedConversation.id,
        message: `File: ${uploadResponse.data.file_name}`,
        message_type: uploadResponse.data.message_type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name,
        file_size: uploadResponse.data.file_size,
      });
      // Realtime will handle the new message update automatically
      // No need to reload conversations - Realtime subscription will update the UI
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="chat-page-container">
        <div className="loading">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="chat-page-container">
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h2>Conversations</h2>
        </div>
        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div className="empty-state">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="conversation-header">
                  <div className="conversation-name">
                    {conv.customer_name || conv.customer_email || 'Unknown Customer'}
                  </div>
                  {conv.unread_count && conv.unread_count > 0 && (
                    <span className="unread-badge">{conv.unread_count}</span>
                  )}
                </div>
                {conv.last_message && (
                  <div className="conversation-preview">
                    {conv.last_message.message_type === 'file' || conv.last_message.message_type === 'image' ? (
                      <span className="file-indicator">
                        <FaPaperclip style={{ marginRight: '0.25rem', fontSize: '0.75rem' }} />
                        {conv.last_message.file_name}
                      </span>
                    ) : (
                      <span>{conv.last_message.message.substring(0, 50)}</span>
                    )}
                  </div>
                )}
                {conv.last_message_at && (
                  <div className="conversation-time">{formatTime(conv.last_message_at)}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="chat-main">
        {selectedConversation ? (
          <>
            <div className="chat-header">
              <div>
                <h3>{selectedConversation.customer_name || selectedConversation.customer_email || 'Customer'}</h3>
                <span className="chat-status">Active</span>
              </div>
            </div>

            <div className="messages-container" ref={messagesContainerRef}>
              {loadingMore && (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
                  Loading older messages...
                </div>
              )}
              {messages.length === 0 ? (
                <div className="empty-messages">No messages yet. Start the conversation!</div>
              ) : (
                messages.map((message) => {
                  const isAdmin = message.sender_id === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`message ${isAdmin ? 'message-sent' : 'message-received'}`}
                    >
                      <div className="message-content">
                        {message.message_type === 'image' && message.file_url ? (
                          <img src={message.file_url} alt={message.file_name || 'Image'} className="message-image" />
                        ) : message.message_type === 'file' && message.file_url ? (
                          <a
                            href={message.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="message-file"
                          >
                            <FaPaperclip style={{ marginRight: '0.5rem' }} />
                            {message.file_name || 'File'} ({(message.file_size || 0) / 1024} KB)
                          </a>
                        ) : (
                          <div className="message-text">{message.message}</div>
                        )}
                        <div className="message-time">
                          {formatTime(message.created_at)}
                          {isAdmin && message.read_at && (
                            <span className="read-indicator">
                              <FaCheck style={{ marginRight: '0.25rem', fontSize: '0.75rem' }} />
                              Read
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                disabled={uploading}
              />
              <button
                className="btn-attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach file"
              >
                <FaPaperclip />
              </button>
              <input
                type="text"
                className="chat-input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={sending}
              />
              <button
                className="btn-send"
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div className="no-conversation-selected">
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;

