import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon, FaArrowUp, FaPlus } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CustomerChatPage.css';

const CustomerChatPage: React.FC = () => {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved as 'dark' | 'light') || 'light';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
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
    // Apply theme
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
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Auto-expand textarea function
  const autoExpand = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    const contentHeight = element.scrollHeight;
    const maxHeight = 150; 
    
    if (contentHeight > maxHeight) {
      element.style.height = `${maxHeight}px`;
      element.style.overflowY = 'auto';
    } else {
      element.style.height = `${Math.max(24, contentHeight)}px`;
      element.style.overflowY = 'hidden';
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
      autoExpand(textareaRef.current);
    }
  }, [autoExpand]);

  useEffect(() => {
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

  // Load or get the single conversation for this user
  const loadConversation = async () => {
    try {
      setLoading(true);
      const response = await chatAPI.getConversations();
      if (response.data && response.data.length > 0) {
        // Use the most recent conversation
        setConversation(response.data[0]);
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

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || newMessage;
    if (!textToSend.trim() || sending) return;

    try {
      setSending(true);
      
      // Build message payload - only include conversation_id if we have one
      // If no conversation exists, backend will create one
      const messagePayload: any = {
        message: textToSend.trim(),
      };
      if (conversation?.id) {
        messagePayload.conversation_id = conversation.id;
      }

      const messageResponse = await chatAPI.sendMessage(messagePayload);
      
      // If this was a new conversation, set it up
      if (!conversation?.id) {
        const newConvId = messageResponse.data.conversation_id;
        const convsResponse = await chatAPI.getConversations();
        if (convsResponse.data) {
          const newConv = convsResponse.data.find(c => c.id === newConvId);
          if (newConv) {
            setConversation(newConv);
            await loadMessages(newConvId);
            setupRealtimeSubscriptions(newConvId);
          }
        }
      }
      
      if (!messageText) {
        setNewMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = '24px';
        }
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
      
      // Build message payload - only include conversation_id if we have one
      const messagePayload: any = {
        message: `File: ${uploadResponse.data.file_name}`,
        message_type: uploadResponse.data.message_type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name,
        file_size: uploadResponse.data.file_size,
      };
      if (conversation?.id) {
        messagePayload.conversation_id = conversation.id;
      }

      const messageResponse = await chatAPI.sendMessage(messagePayload);

      // If this was a new conversation, set it up
      if (!conversation?.id) {
        const newConvId = messageResponse.data.conversation_id;
        const convsResponse = await chatAPI.getConversations();
        if (convsResponse.data) {
          const newConv = convsResponse.data.find(c => c.id === newConvId);
          if (newConv) {
            setConversation(newConv);
            await loadMessages(newConvId);
            setupRealtimeSubscriptions(newConvId);
          }
        }
      }

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

  if (loading) {
    return (
      <div className="customer-chat-page">
        <div className="customer-chat-loading">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="customer-chat-page">
      {/* Main Chat Area */}
      <div className="chat-main-area">
        <div className="customer-chat-header">
          <div className="header-left">
            <h1>Chat with Reel48</h1>
          </div>
          <div className="header-right">
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <FaSun /> : <FaMoon />}
            </button>
          </div>
        </div>

        <div className="customer-chat-messages">
          <div className="message-width-limiter">
            {!conversation || messages.length === 0 ? (
              <div className="empty-state-container">
                <div className="greeting">
                  <h2>Hello,</h2>
                  <p>How can I help you today?</p>
                </div>
                <div className="suggested-prompts">
                  <button className="prompt-chip" onClick={() => sendMessage("What does Reel48 do?")}>
                    What does Reel48 do?
                  </button>
                  <button className="prompt-chip" onClick={() => sendMessage("How long will my hats take to be delivered?")}>
                    How long will my hats take to be delivered?
                  </button>
                  <button className="prompt-chip" onClick={() => sendMessage("Give me a quote for 500 custom hats.")}>
                    Give me a quote for 500 custom hats.
                  </button>
                </div>
              </div>
            ) : (
              <div id="chat-container">
                {messages.map((message) => {
                  const isCustomer = message.sender_id === user?.id;
                  
                  return (
                    <div
                      key={message.id}
                      className={`message ${isCustomer ? 'user-message' : 'ai-message'}`}
                    >
                      <div className="message-wrapper">
                        <div className="message-sender-name">
                          {isCustomer ? 'You' : 'Reel48'}
                        </div>
                        <div className="message-content">
                          {message.message_type === 'image' && message.file_url ? (
                            <img
                              src={message.file_url}
                              alt={message.file_name || 'Image'}
                              style={{ maxWidth: '100%', borderRadius: '8px' }}
                            />
                          ) : message.message_type === 'file' && message.file_url ? (
                            <a
                              href={message.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'inherit', textDecoration: 'underline' }}
                            >
                              <FaPaperclip />
                              {message.file_name || 'File'}
                            </a>
                          ) : (
                            isCustomer ? (
                              message.message
                            ) : (
                              <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {message.message}
                                </ReactMarkdown>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sending && messages.length > 0 && messages[messages.length - 1].sender_id === user?.id && (
                  <div className="message ai-message">
                    <div className="message-wrapper">
                      <div className="message-sender-name">Reel48</div>
                      <div className="message-content">
                        <div className="typing-indicator">
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="input-area-wrapper">
          <div className="input-island">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            
            <div className="attach-menu-wrapper" ref={attachMenuRef}>
              <button
                className="attach-btn"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                disabled={uploading || sending}
                title="Add content"
              >
                <FaPlus />
              </button>
              
              {showAttachMenu && (
                <div className="attach-menu-popup">
                  <button 
                    className="attach-menu-item"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowAttachMenu(false);
                    }}
                  >
                    <FaPaperclip /> Add a file
                  </button>
                </div>
              )}
            </div>
            
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Message Reel48..."
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
              className={`send-btn ${newMessage.trim() ? 'active' : ''}`}
              onClick={() => sendMessage()}
              disabled={!newMessage.trim() || sending}
            >
              <FaArrowUp />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerChatPage;
