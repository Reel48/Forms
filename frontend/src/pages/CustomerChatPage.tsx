import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon } from 'react-icons/fa';
import { renderTextWithLinks } from '../utils/textUtils';
import './CustomerChatPage.css';

const CustomerChatPage: React.FC = () => {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ochoUserId, setOchoUserId] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<'ai' | 'human'>('ai');
  const [updatingMode, setUpdatingMode] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved as 'dark' | 'light') || 'light';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markingAsReadRef = useRef(false);
  const lastMarkAsReadRef = useRef<number>(0);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);

  // Setup Realtime subscriptions for messages and conversations
  const setupRealtimeSubscriptions = useCallback(async (conversationId: string) => {
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
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as ChatMessage;
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });
            
            // Unread count not needed in full-page view
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as ChatMessage;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updatedMessage.id ? updatedMessage : msg))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedMessage = payload.old as ChatMessage;
            setMessages((prev) => prev.filter((msg) => msg.id !== deletedMessage.id));
          }
        }
      )
      .subscribe();

    messagesSubscriptionRef.current = messagesChannel;

    // Subscribe to conversation updates
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
      .subscribe();

    conversationsSubscriptionRef.current = conversationsChannel;
  }, [user?.id]);

  useEffect(() => {
    loadConversation();
    // Get Ocho user ID on component mount
    chatAPI.getOchoUserId().then((response) => {
      setOchoUserId(response.data.ocho_user_id);
    }).catch((error) => {
      console.error('Failed to get Ocho user ID:', error);
    });
    // Apply theme to container (only set attribute for dark mode, light is default)
    const container = document.querySelector('.customer-chat-page');
    if (container) {
      if (theme === 'dark') {
        container.setAttribute('data-theme', 'dark');
      } else {
        container.removeAttribute('data-theme');
      }
    }
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
      markAllAsRead();
    }
  }, [conversation?.id, setupRealtimeSubscriptions]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Auto-expand textarea function
  const autoExpand = useCallback((element: HTMLTextAreaElement) => {
    // Reset height to auto to get accurate scrollHeight
    element.style.height = 'auto';
    
    // Calculate the total height required by the content
    const contentHeight = element.scrollHeight;
    
    // Get the calculated maximum height from CSS (120px = ~5 lines)
    const maxHeight = 120; // 5 lines * 24px line-height
    
    // Check if the content height exceeds the max height
    if (contentHeight > maxHeight) {
      // If it exceeds the max, set height to max height
      element.style.height = `${maxHeight}px`;
      // Add a class to make the scrollbar visible
      element.classList.add('scrollable');
    } else {
      // If it doesn't exceed the max, set height to the content height
      element.style.height = `${contentHeight}px`;
      // Remove the scrollable class
      element.classList.remove('scrollable');
    }
  }, []);

  // Auto-resize textarea when message changes
  useEffect(() => {
    if (textareaRef.current) {
      autoExpand(textareaRef.current);
    }
  }, [newMessage, autoExpand]);

  // Set initial height on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px'; // Initial line height
    }
  }, []);

  useEffect(() => {
    // Apply theme to container (only set attribute for dark mode, light is default)
    const container = document.querySelector('.customer-chat-page');
    if (container) {
      if (theme === 'dark') {
        container.setAttribute('data-theme', 'dark');
      } else {
        container.removeAttribute('data-theme');
      }
    }
    localStorage.setItem('chat-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const loadConversation = async () => {
    try {
      setLoading(true);
      const response = await chatAPI.getConversations();
      if (response.data.length > 0) {
        const conv = response.data[0];
        setConversation(conv);
        setChatMode(conv.chat_mode || 'ai');
      } else {
        setConversation(null);
        setChatMode('ai');
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeToggle = async (newMode: 'ai' | 'human') => {
    if (!conversation || updatingMode) return;
    
    try {
      setUpdatingMode(true);
      await chatAPI.updateChatMode(conversation.id, newMode);
      setChatMode(newMode);
      // Update conversation state
      setConversation(prev => prev ? { ...prev, chat_mode: newMode } : null);
    } catch (error) {
      console.error('Failed to update chat mode:', error);
      alert('Failed to update chat mode. Please try again.');
    } finally {
      setUpdatingMode(false);
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

  const markAllAsRead = async () => {
    if (!conversation || markingAsReadRef.current) return;
    
    markingAsReadRef.current = true;
    lastMarkAsReadRef.current = Date.now();
    
    try {
      await chatAPI.markAllRead(conversation.id);
      setMessages(prevMessages => 
        prevMessages.map(msg => ({ ...msg, read_at: msg.read_at || new Date().toISOString() }))
      );
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    } finally {
      markingAsReadRef.current = false;
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
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
        message: newMessage.trim(),
      });
      setNewMessage('');
      // Reset textarea height to initial single line
      if (textareaRef.current) {
        textareaRef.current.style.height = '24px';
        textareaRef.current.classList.remove('scrollable');
      }
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

  if (loading) {
    return (
      <div className="customer-chat-page">
        <div className="customer-chat-loading">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="customer-chat-page">
      <div className="customer-chat-container">
        <div className="customer-chat-header">
          <div>
            <h1>Chat with Reel48</h1>
            <span className="customer-chat-status">
              {chatMode === 'ai' ? 'Chatting with Reel48 AI' : 'Chatting with a human representative'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <FaSun /> : <FaMoon />}
            </button>
            <div className="customer-chat-mode-toggle">
            <button
              className={`mode-toggle-btn ${chatMode === 'ai' ? 'active' : ''}`}
              onClick={() => handleModeToggle('ai')}
              disabled={updatingMode}
              title="Chat with Reel48 AI"
            >
              Reel48 AI
            </button>
            <button
              className={`mode-toggle-btn ${chatMode === 'human' ? 'active' : ''}`}
              onClick={() => handleModeToggle('human')}
              disabled={updatingMode}
              title="Chat with a human representative"
            >
              Human
            </button>
          </div>
          </div>
        </div>

        <div className="customer-chat-messages">
          {messages.length === 0 ? (
            <div className="customer-chat-empty">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isCustomer = message.sender_id === user?.id;
              const isAI = message.sender_id === 'ai-assistant' || message.sender_id === ochoUserId;
              
              // Get sender name
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
                  className={`customer-chat-message ${isCustomer ? 'message-sent' : 'message-received'} ${isAI ? 'message-ai' : ''}`}
                >
                  <div className="customer-chat-message-content">
                    <div className="customer-chat-message-sender">
                      {senderName}
                    </div>
                    {message.message_type === 'image' && message.file_url ? (
                      <img
                        src={message.file_url}
                        alt={message.file_name || 'Image'}
                        className="customer-chat-image"
                      />
                    ) : message.message_type === 'file' && message.file_url ? (
                      <a
                        href={message.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="customer-chat-file"
                      >
                        <FaPaperclip style={{ marginRight: '0.5rem' }} />
                        {message.file_name || 'File'} ({(message.file_size || 0) / 1024} KB)
                      </a>
                    ) : (
                      <div className="customer-chat-text">{renderTextWithLinks(message.message)}</div>
                    )}
                    <div className="customer-chat-time">{formatTime(message.created_at)}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="customer-chat-input-container">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />
          <div className="input-wrapper">
            <button
              className="customer-chat-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach file"
            >
              <FaPaperclip />
            </button>
            <textarea
              ref={textareaRef}
              id="chat-input"
              className="customer-chat-input"
              placeholder="Message Reel48 AI..."
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                autoExpand(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending}
              rows={1}
            />
            <button
              className="customer-chat-send"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerChatPage;

