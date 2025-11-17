import React, { useState, useEffect, useRef } from 'react';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FaComments, FaPaperclip, FaTimes } from 'react-icons/fa';
import './CustomerChatWidget.css';

const CustomerChatWidget: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    loadConversation();
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (conversation) {
      loadMessages(conversation.id);
      subscribeToMessages(conversation.id);
    }
    return () => {
      // Cleanup subscription when conversation changes
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [conversation?.id]); // Only depend on conversation ID to prevent re-subscription

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
      markAllAsRead();
    }
  }, [messages, isOpen]);

  // Check for unread messages periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOpen && conversation) {
        checkUnreadCount();
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [isOpen, conversation]);

  const loadConversation = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
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

  const subscribeToMessages = (conversationId: string) => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    // Subscribe to new messages via Supabase Realtime
    const channel = supabase
      .channel(`customer_chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMessage]);
          // Update unread count if widget is closed
          if (!isOpen) {
            setUnreadCount((prev) => prev + 1);
            // Show browser notification if conditions are met
            checkAndShowNotification(newMessage);
          }
          // Refresh conversation
          loadConversation();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Chat subscription active');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Chat subscription error:', status);
          // Don't retry automatically - let the component handle it
        }
      });

    subscriptionRef.current = channel;
  };

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

  const checkAndShowNotification = (message: ChatMessage) => {
    // Only show notification if:
    // 1. First message of the day, OR
    // 2. Message is unread for 24+ hours
    const lastNotificationDate = localStorage.getItem('lastChatNotificationDate');
    const today = new Date().toDateString();
    const messageDate = new Date(message.created_at);
    const hoursSinceMessage = (Date.now() - messageDate.getTime()) / (1000 * 60 * 60);

    const shouldNotify = 
      (!lastNotificationDate || lastNotificationDate !== today) || // First message of the day
      hoursSinceMessage >= 24; // Unread for 24+ hours

    if (shouldNotify && 'Notification' in window && Notification.permission === 'granted') {
      const notificationBody = message.message_type === 'file' || message.message_type === 'image'
        ? `File: ${message.file_name || 'File'}`
        : message.message.substring(0, 100);
      
      new Notification('New message from Reel48', {
        body: notificationBody,
        icon: '/favicon.ico',
        tag: 'reel48-chat', // Prevent duplicate notifications
      });
      localStorage.setItem('lastChatNotificationDate', today);
    }
  };

  const markAllAsRead = async () => {
    if (!conversation) return;
    try {
      await chatAPI.markAllRead(conversation.id);
      setUnreadCount(0);
      loadConversation();
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
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
      // Messages will be updated via realtime subscription
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

  if (loading) {
    return null; // Don't show widget while loading
  }

  return (
    <>
      {!isOpen && (
        <button
          className="chat-widget-button"
          onClick={() => setIsOpen(true)}
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
              <div className="chat-widget-empty">No messages yet. Start the conversation!</div>
            ) : (
              messages.map((message) => {
                const isCustomer = message.sender_id === user?.id;
                return (
                  <div
                    key={message.id}
                    className={`chat-widget-message ${isCustomer ? 'message-sent' : 'message-received'}`}
                  >
                    <div className="chat-widget-message-content">
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
                        <div className="chat-widget-text">{message.message}</div>
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

