import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatConversation, type ChatMessage, type ChatAiActionLog } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaCheck, FaTrash } from 'react-icons/fa';
import { ChatMessageBody } from '../components/chat/ChatMessageBody';
import { useNotifications } from '../components/NotificationSystem';
import './ChatPage.css';

const ChatPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showNotification: notify } = useNotifications();
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
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all', 'active', 'resolved', 'archived'
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [ochoUserId, setOchoUserId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [humanOnly, setHumanOnly] = useState(false);
  const [needsResponseOnly, setNeedsResponseOnly] = useState(false);
  const [aiLogs, setAiLogs] = useState<ChatAiActionLog[]>([]);
  const [showAiLogs, setShowAiLogs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);
  const globalConversationsSubscriptionRef = useRef<any>(null); // For admins to see all conversations
  const notificationPermissionRequested = useRef(false);
  const isAdmin = role === 'admin';

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
              loadConversations(false); // Silent refresh - no loading screen
              // Show notification for messages in other conversations
              const conversation = conversations.find(c => c.id === newMessage.conversation_id);
              showBrowserNotification(newMessage, conversation?.customer_name || conversation?.customer_email || undefined);
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
          // Reload conversations to get updated data (silent refresh - no loading screen)
          loadConversations(false);
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

  const showBrowserNotification = (message: ChatMessage, customerName?: string) => {
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

  // Setup global subscription for admins to see all conversations updating in real-time
  useEffect(() => {
    if (!isAdmin) return;

    const realtimeClient = getRealtimeClient();

    // Subscribe to all conversations for admins (to see new conversations and updates)
    const globalConversationsChannel = realtimeClient
      .channel('admin_all_conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        (payload) => {
          console.log('Admin: Global conversation event:', payload.eventType);
          // Reload conversations list to get updated data
          loadConversations(false); // Silent refresh
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          console.log('Admin: New message in any conversation:', payload);
          // Reload conversations to update unread counts and last_message_at
          loadConversations(false); // Silent refresh
          
          // Show notification if message is not in currently selected conversation
          const newMessage = payload.new as ChatMessage;
          // Use a callback to access current state
          setConversations((currentConversations) => {
            const conversation = currentConversations.find(c => c.id === newMessage.conversation_id);
            if (selectedConversation?.id !== newMessage.conversation_id) {
              showBrowserNotification(newMessage, conversation?.customer_name || conversation?.customer_email || undefined);
            }
            return currentConversations;
          });
        }
      )
      .subscribe((status) => {
        console.log('Admin: Global conversations subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Admin successfully subscribed to all conversations via Realtime');
        }
      });

    globalConversationsSubscriptionRef.current = globalConversationsChannel;

    return () => {
      if (globalConversationsSubscriptionRef.current) {
        realtimeClient.removeChannel(globalConversationsSubscriptionRef.current);
        globalConversationsSubscriptionRef.current = null;
      }
    };
  }, [isAdmin, selectedConversation?.id]);

  useEffect(() => {
    console.log('ChatPage: Loading conversations and setting up Realtime subscriptions');
    loadConversations(true); // Show loading on initial load only
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
      if (globalConversationsSubscriptionRef.current) {
        realtimeClient.removeChannel(globalConversationsSubscriptionRef.current);
        globalConversationsSubscriptionRef.current = null;
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
      console.log('Selected conversation:', selectedConversation.id, 'for customer:', selectedConversation.customer_name || selectedConversation.customer_email);
      loadMessages(selectedConversation.id, true);
      markAllAsRead(selectedConversation.id);
      setupRealtimeSubscriptions(selectedConversation.id);
      setShouldAutoScroll(true); // Reset auto-scroll when switching conversations
    }
  }, [selectedConversation?.id, setupRealtimeSubscriptions]);

  useEffect(() => {
    if (!selectedConversation) {
      setAiLogs([]);
      return;
    }
    const loadLogs = async () => {
      try {
        const resp = await chatAPI.getAiActions(selectedConversation.id, 50);
        setAiLogs(resp.data.logs || []);
      } catch (e: any) {
        // If migration not applied yet, backend returns 501; treat as "not available"
        if (e?.response?.status === 501) {
          setAiLogs([]);
          return;
        }
        console.error('Failed to load AI action logs:', e);
      }
    };
    void loadLogs();
  }, [selectedConversation?.id]);

  useEffect(() => {
    // Get Ocho user ID on component mount
    chatAPI.getOchoUserId().then((response) => {
      setOchoUserId(response.data.ocho_user_id);
    }).catch((error) => {
      console.error('Failed to get Ocho user ID:', error);
    });
  }, []);

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
  // Use silent refresh (no loading screen) for background updates
  useEffect(() => {
    if (!selectedConversation) return;

    const interval = setInterval(() => {
      if (selectedConversation) {
        // Only poll occasionally as backup - Realtime should handle most updates
        // Use silent refresh to avoid showing loading screen
        loadConversations(false);
      }
    }, 60000); // Check every 60 seconds as backup (Realtime handles real-time updates)

    return () => clearInterval(interval);
  }, [selectedConversation?.id]);

  const loadConversations = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await chatAPI.getConversations();
      console.log('Loaded conversations:', response.data.length);
      console.log('Conversations:', response.data);
      setConversations(response.data);
      if (response.data.length > 0 && !selectedConversation) {
        setSelectedConversation(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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
      console.log(`Loaded ${loadedMessages.length} messages for conversation ${conversationId}`);
      console.log('Messages are for conversation:', conversationId);
      
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
      // Refresh conversations to update unread counts (silent refresh - no loading screen)
      loadConversations(false);
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const updateConversationStatus = async (conversationId: string, newStatus: 'active' | 'resolved' | 'archived') => {
    try {
      setUpdatingStatus(true);
      await chatAPI.updateConversationStatus(conversationId, newStatus);
      // Update conversation in state
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, status: newStatus } : conv
        )
      );
      // Update selected conversation if it's the one being updated
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation({ ...selectedConversation, status: newStatus });
      }
    } catch (error) {
      console.error('Failed to update conversation status:', error);
      notify({ type: 'error', message: 'Failed to update conversation status. Please try again.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    
    if (!window.confirm(`Are you sure you want to delete this conversation with ${selectedConversation.customer_name || selectedConversation.customer_email || 'this customer'}? This action cannot be undone.`)) {
      return;
    }

    try {
      await chatAPI.deleteConversation(selectedConversation.id);
      // Remove from conversations list
      setConversations((prev) => prev.filter((conv) => conv.id !== selectedConversation.id));
      // Clear selected conversation
      setSelectedConversation(null);
      setMessages([]);
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      notify({ type: 'error', message: error.response?.data?.detail || 'Failed to delete conversation' });
    }
  };

  // Filter conversations by status
  const filteredConversations = conversations.filter((conv) => {
    if (statusFilter !== 'all' && conv.status !== statusFilter) return false;
    if (unreadOnly && (!conv.unread_count || conv.unread_count <= 0)) return false;
    if (humanOnly && conv.chat_mode !== 'human') return false;
    if (needsResponseOnly) {
      const customerSpokeLast = conv.last_message?.sender_id === conv.customer_id;
      const hasUnread = Boolean(conv.unread_count && conv.unread_count > 0);
      if (!(customerSpokeLast && hasUnread)) return false;
    }
    return true;
  });

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
      
      // Note: AI auto-responds to customer messages automatically via backend
      // No need to manually trigger here
    } catch (error) {
      console.error('Failed to send message:', error);
      notify({ type: 'error', message: 'Failed to send message. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  // Note: generateAIResponse function is available but not currently used in the UI
  // It can be called programmatically if needed for future features
  // const generateAIResponse = async () => {
  //   if (!selectedConversation) return;
  //   try {
  //     await chatAPI.generateAIResponse(selectedConversation.id);
  //   } catch (error: any) {
  //     console.error('Failed to generate AI response:', error);
  //   }
  // };

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
      notify({ type: 'error', message: 'Failed to upload file. Please try again.' });
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
          <h2>Customer Conversations</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0' }}>
            View and respond to customer messages
          </p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              fontSize: '0.875rem',
              width: '100%'
            }}
          >
            <option value="all">All Conversations</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
          </select>
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={needsResponseOnly} onChange={(e) => setNeedsResponseOnly(e.target.checked)} />
              Needs response
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} />
              Human mode
            </label>
          </div>
        </div>
        <div className="conversations-list">
          {filteredConversations.length === 0 ? (
            <div className="empty-state">No conversations found</div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="conversation-header">
                  <div className="conversation-name">
                    {conv.customer_name || conv.customer_email || 'Unknown Customer'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {conv.status && conv.status !== 'active' && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor:
                            conv.status === 'resolved'
                              ? 'var(--color-success-light)'
                              : 'var(--color-gray-light)',
                          color:
                            conv.status === 'resolved'
                              ? 'var(--color-success)'
                              : 'var(--color-gray)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {conv.status}
                      </span>
                    )}
                    {conv.chat_mode === 'human' && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-warning-light)',
                          color: 'var(--color-warning)',
                          textTransform: 'capitalize',
                        }}
                        title="AI paused"
                      >
                        human
                      </span>
                    )}
                    {conv.unread_count && conv.unread_count > 0 && (
                      <span className="unread-badge">{conv.unread_count}</span>
                    )}
                  </div>
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <span
                    className="chat-status"
                    style={{
                      backgroundColor:
                        selectedConversation.status === 'active'
                          ? 'rgb(224 231 255)'
                          : selectedConversation.status === 'resolved'
                          ? 'var(--color-success-light)'
                          : 'var(--color-gray-light)',
                      color:
                        selectedConversation.status === 'active'
                          ? 'rgb(99 102 241)'
                          : selectedConversation.status === 'resolved'
                          ? 'var(--color-success)'
                          : 'var(--color-gray)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {selectedConversation.status || 'active'}
                  </span>
                  <select
                    value={selectedConversation.status || 'active'}
                    onChange={(e) => {
                      const newStatus = e.target.value as 'active' | 'resolved' | 'archived';
                      updateConversationStatus(selectedConversation.id, newStatus);
                    }}
                    disabled={updatingStatus}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--brand-white)',
                      cursor: updatingStatus ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select
                    value={selectedConversation.chat_mode || 'ai'}
                    onChange={async (e) => {
                      const nextMode = e.target.value as 'ai' | 'human';
                      try {
                        await chatAPI.updateChatMode(selectedConversation.id, nextMode);
                        setSelectedConversation({ ...selectedConversation, chat_mode: nextMode });
                        setConversations((prev) =>
                          prev.map((c) => (c.id === selectedConversation.id ? { ...c, chat_mode: nextMode } : c))
                        );
                        notify({
                          type: 'success',
                          message: nextMode === 'human' ? 'Conversation set to human mode (AI paused)' : 'Conversation set to AI mode',
                        });
                      } catch (err) {
                        console.error('Failed to update chat mode:', err);
                        notify({ type: 'error', message: 'Failed to update chat mode' });
                      }
                    }}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--brand-white)',
                      cursor: 'pointer',
                    }}
                    title="AI vs Human mode"
                  >
                    <option value="ai">AI mode</option>
                    <option value="human">Human mode</option>
                  </select>
                  <button
                    onClick={handleDeleteConversation}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-danger, #dc2626)',
                      backgroundColor: 'var(--color-danger, #dc2626)',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    title="Delete conversation"
                  >
                    <FaTrash style={{ fontSize: '0.75rem' }} />
                    Delete
                  </button>
                  <button
                    onClick={() => setShowAiLogs((v) => !v)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--brand-white)',
                      cursor: 'pointer',
                    }}
                    title="Toggle AI action logs"
                  >
                    AI actions {aiLogs.length > 0 ? `(${aiLogs.length})` : ''}
                  </button>
                  {/* AI auto-responds automatically - no manual button needed */}
                </div>
              </div>
            </div>

            {showAiLogs && (
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                {aiLogs.length === 0 ? (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    No AI action logs (or audit migration not applied).
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {aiLogs.slice(0, 10).map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--brand-white)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600 }}>{log.function_name}</span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '999px',
                              background: log.success ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                              color: log.success ? 'var(--color-success)' : 'var(--color-danger)',
                            }}
                          >
                            {log.success ? 'success' : 'failed'}
                          </span>
                          {log.error && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {log.error}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="messages-container" ref={messagesContainerRef}>
              {loadingMore && (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
                  Loading older messages...
                </div>
              )}
              {messages.length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isAdmin = message.sender_id === user?.id;
                  const isAI = message.sender_id === 'ai-assistant' || message.sender_id === ochoUserId;
                  
                  // Get sender name
                  let senderName = '';
                  if (isAI) {
                    senderName = 'Ocho';
                  } else if (isAdmin) {
                    senderName = user?.email?.split('@')[0] || 'You';
                  } else {
                    senderName = selectedConversation?.customer_name || selectedConversation?.customer_email || 'Customer';
                  }
                  
                  return (
                    <div
                      key={message.id}
                      className={`message ${isAdmin ? 'message-sent' : 'message-received'} ${isAI ? 'message-ai' : ''}`}
                    >
                      <div className="message-content">
                        <div className="message-sender-name">
                          {senderName}
                        </div>
                        <div className="message-text">
                          <ChatMessageBody message={message} renderAsMarkdown={Boolean(isAI)} />
                        </div>
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
                placeholder="Type a message to the customer..."
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
            <p>Select a customer conversation to view chat history and respond</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;

