import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaComments, FaPaperclip, FaTimes } from 'react-icons/fa';
import { renderTextWithLinks } from '../utils/textUtils';
import './CustomerChatWidget.css';

const CustomerChatWidget: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ochoUserId, setOchoUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markingAsReadRef = useRef(false);
  const lastMarkAsReadRef = useRef<number>(0);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);

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
              return [...prev, newMessage];
            });
            
            // Update unread count if message is from someone else
            if (newMessage.sender_id !== user?.id) {
              setUnreadCount((prev) => prev + 1);
              // Show browser notification if chat is closed
              showNotification(newMessage);
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
          // Fallback: the polling will handle updates if Realtime fails
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
          // Update conversation state directly without reloading (avoids widget disappearing)
          if (payload.new) {
            setConversation((prev) => {
              if (prev && prev.id === payload.new.id) {
                return { ...prev, ...payload.new };
              }
              return prev;
            });
          }
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

  useEffect(() => {
    console.log('CustomerChatWidget: Loading conversation and setting up Realtime subscriptions');
    loadConversation(true); // Pass true to indicate initial load
    // Get Ocho user ID on component mount
    chatAPI.getOchoUserId().then((response) => {
      setOchoUserId(response.data.ocho_user_id);
    }).catch((error) => {
      console.error('Failed to get Ocho user ID:', error);
    });

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

  useEffect(() => {
    if (conversation) {
      loadMessages(conversation.id);
      setupRealtimeSubscriptions(conversation.id);
    }
  }, [conversation?.id, setupRealtimeSubscriptions]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    if (isOpen && conversation) {
      const now = Date.now();
      // Only mark as read if it's been at least 2 seconds since last call
      if (now - lastMarkAsReadRef.current > 2000) {
        markAllAsRead();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversation?.id]);

  // Fallback polling: Only poll when chat is closed (Realtime handles updates when open)
  // Note: checkUnreadCount doesn't show loading, so this is fine
  useEffect(() => {
    if (!conversation || isOpen) return; // Don't poll when chat is open (Realtime handles it)

    const interval = setInterval(() => {
      if (conversation && !isOpen) {
        checkUnreadCount();
      }
    }, 30000); // Check every 30 seconds when closed (Realtime handles when open) - reduced frequency

    return () => clearInterval(interval);
  }, [conversation?.id, isOpen]);

  const loadConversation = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setInitialLoading(true);
      }
      const response = await chatAPI.getConversations();
      if (response.data.length > 0) {
        setConversation(response.data[0]);
        checkUnreadCount(response.data[0]);
      } else {
        // Conversation will be created on first message
        setConversation(null);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      if (isInitialLoad) {
        setInitialLoading(false);
      }
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await chatAPI.getMessages(conversationId);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  // NOTE: Realtime subscriptions use service role key (bypasses RLS)
  // Fallback polling only runs when chat is closed

  const checkUnreadCount = async (conv?: ChatConversation) => {
    const convToCheck = conv || conversation;
    if (!convToCheck) return;

    try {
      const response = await chatAPI.getMessages(convToCheck.id);
      const unread = response.data.filter(
        (msg) => !msg.read_at && msg.sender_id !== user?.id
      ).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to check unread count:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!conversation || markingAsReadRef.current) return;
    
    markingAsReadRef.current = true;
    lastMarkAsReadRef.current = Date.now();
    
    try {
      await chatAPI.markAllRead(conversation.id);
      setUnreadCount(0);
      // Update messages to reflect read status without reloading conversation
      setMessages(prevMessages => 
        prevMessages.map(msg => ({ ...msg, read_at: msg.read_at || new Date().toISOString() }))
      );
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    } finally {
      markingAsReadRef.current = false;
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const showNotification = (message: ChatMessage) => {
    // Only show notification if:
    // 1. Chat widget is closed
    // 2. Notification permission is granted
    // 3. Message is from someone else (not the current user)
    if (isOpen || message.sender_id === user?.id) return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      const messagePreview = message.message_type === 'file' || message.message_type === 'image'
        ? `📎 ${message.file_name || 'File'}`
        : message.message.length > 50
        ? message.message.substring(0, 50) + '...'
        : message.message;
      
      new Notification('New message from Reel48', {
        body: messagePreview,
        icon: '/logo-light.png', // Use company logo if available
        tag: `chat-${conversation?.id}`, // Group notifications by conversation
        requireInteraction: false,
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      let convId = conversation?.id;

      // Create conversation if it doesn't exist
      if (!convId) {
        const convResponse = await chatAPI.getConversations();
        if (convResponse.data.length > 0) {
          convId = convResponse.data[0].id;
          setConversation(convResponse.data[0]);
        }
      }

      await chatAPI.sendMessage({
        conversation_id: convId,
        message: newMessage.trim(),
      });
      setNewMessage('');
      // Realtime will handle the new message update automatically - no need to reload
      // The Realtime subscription will add the message to the UI automatically
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;

    try {
      setUploading(true);
      const uploadResponse = await chatAPI.uploadFile(file);
      let convId = conversation?.id;

      if (!convId) {
        const convResponse = await chatAPI.getConversations();
        if (convResponse.data.length > 0) {
          convId = convResponse.data[0].id;
          setConversation(convResponse.data[0]);
        }
      }

      await chatAPI.sendMessage({
        conversation_id: convId,
        message: `File: ${uploadResponse.data.file_name}`,
        message_type: uploadResponse.data.message_type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name,
        file_size: uploadResponse.data.file_size,
      });
      // Realtime will handle the new message update automatically
      // The Realtime subscription will add the message to the UI automatically
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
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  useEffect(() => {
    // Request notification permission when component mounts
    requestNotificationPermission();
  }, []);

  // Only hide widget during initial load, not during updates
  if (initialLoading) {
    return null; // Don't show widget while initially loading
  }

  return (
    <>
      {!isOpen && (
        <button
          className="chat-widget-button"
          onClick={() => navigate('/chat')}
          title="Chat with Reel48"
        >
          <FaComments />
          {unreadCount > 0 && <span className="chat-widget-badge">{unreadCount}</span>}
        </button>
      )}

      {isOpen && (
        <div className="chat-widget-container">
          <div className="chat-widget-header">
            <div>
              <h3>Chat with Reel48</h3>
              <span className="chat-widget-status">We're here to help</span>
            </div>
            <button
              className="chat-widget-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <FaTimes />
            </button>
          </div>

          <div className="chat-widget-messages">
            {messages.length === 0 ? (
              <div className="chat-widget-empty">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isCustomer = message.sender_id === user?.id;
                const isAI = message.sender_id === 'ai-assistant' || message.sender_id === ochoUserId;
                let senderName = '';
                if (isAI) {
                  senderName = 'Reel48 AI';
                } else if (isCustomer) {
                  senderName = 'You';
                } else {
                  senderName = 'Reel48 Support';
                }
                
                return (
                  <div
                    key={message.id}
                    className={`chat-widget-message ${isCustomer ? 'message-sent' : 'message-received'} ${isAI ? 'message-ai' : ''}`}
                  >
                    <div className="chat-widget-message-content">
                      <div className="chat-widget-message-sender">
                        {senderName}
                      </div>
                      {message.message_type === 'image' && message.file_url ? (
                        <img
                          src={message.file_url}
                          alt={message.file_name || 'Image'}
                          className="chat-widget-image"
                        />
                      ) : message.message_type === 'file' && message.file_url ? (
                        <a
                          href={message.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-widget-file"
                        >
                          <FaPaperclip style={{ marginRight: '0.5rem' }} />
                          {message.file_name || 'File'} ({(message.file_size || 0) / 1024} KB)
                        </a>
                      ) : (
                        <div className="chat-widget-text">{renderTextWithLinks(message.message)}</div>
                      )}
                      <div className="chat-widget-time">{formatTime(message.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-widget-input-container">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <button
              className="chat-widget-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach file"
            >
              <FaPaperclip />
            </button>
            <input
              type="text"
              className="chat-widget-input"
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
              className="chat-widget-send"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomerChatWidget;

