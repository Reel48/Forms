import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon, FaRobot, FaUser, FaMagic, FaArrowUp, FaQuestionCircle, FaInfoCircle } from 'react-icons/fa';
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

  const SUGGESTION_CHIPS = [
    { icon: <FaInfoCircle />, text: "What services do you offer?", query: "What services do you offer?" },
    { icon: <FaMagic />, text: "Help me choose a package", query: "Can you help me choose the right package?" },
    { icon: <FaQuestionCircle />, text: "How does pricing work?", query: "How does your pricing work?" },
  ];

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
    // Get Ocho user ID on component mount
    chatAPI.getOchoUserId().then((response) => {
      setOchoUserId(response.data.ocho_user_id);
    }).catch((error) => {
      console.error('Failed to get Ocho user ID:', error);
    });
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
      textareaRef.current.style.height = '24px';
    }
  }, []);

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

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || newMessage;
    if (!textToSend.trim() || sending) return;

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
        message: textToSend.trim(),
      });
      
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

  if (loading) {
    return (
      <div className="customer-chat-page">
        <div className="customer-chat-loading">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="customer-chat-page">
      <div className="customer-chat-header">
        <div className="header-left">
          <h1>
            Reel48 <span style={{ opacity: 0.5, fontWeight: 400 }}>|</span> 
            <div 
              className="model-selector"
              onClick={() => handleModeToggle(chatMode === 'ai' ? 'human' : 'ai')}
              title={chatMode === 'ai' ? "Switch to Human" : "Switch to AI"}
            >
              {chatMode === 'ai' ? 'AI 1.0' : 'Human Support'}
              <span style={{ fontSize: '0.8em', opacity: 0.6 }}>▼</span>
            </div>
          </h1>
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
          {messages.length === 0 ? (
            <div className="empty-state-container">
              <div className="greeting">
                <div className="empty-state-icon"><FaRobot /></div>
                <h2>Hello, how can I help you today?</h2>
              </div>
              <div className="suggestion-chips">
                {SUGGESTION_CHIPS.map((chip, index) => (
                  <button 
                    key={index} 
                    className="chip"
                    onClick={() => sendMessage(chip.query)}
                    disabled={sending}
                  >
                    <div className="chip-icon">{chip.icon}</div>
                    <div className="chip-text">{chip.text}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => {
                const isCustomer = message.sender_id === user?.id;
                // const isAI = message.sender_id === 'ai-assistant' || message.sender_id === ochoUserId;
                
                return (
                  <div
                    key={message.id}
                    className={`message-row ${isCustomer ? 'user' : 'ai'}`}
                  >
                    {!isCustomer && (
                      <div className="avatar ai">
                        <FaRobot />
                      </div>
                    )}
                    
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
                    
                    {isCustomer && (
                      <div className="avatar user">
                        <FaUser />
                      </div>
                    )}
                  </div>
                );
              })}
              {sending && messages.length > 0 && messages[messages.length - 1].sender_id === user?.id && (
                <div className="message-row ai">
                  <div className="avatar ai">
                    <FaRobot />
                  </div>
                  <div className="message-content">
                     <div className="typing-indicator">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                     </div>
                  </div>
                </div>
              )}
            </>
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
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            title="Attach file"
          >
            <FaPaperclip />
          </button>
          
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
  );
};

export default CustomerChatPage;
