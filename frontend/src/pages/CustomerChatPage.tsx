import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon, FaRobot, FaUser, FaArrowUp, FaPlus, FaComment, FaBars, FaTimes } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CustomerChatPage.css';

const CustomerChatPage: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatMode, setChatMode] = useState<'ai' | 'human'>('ai');
  const [updatingMode, setUpdatingMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
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
    loadConversations();
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

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await chatAPI.getConversations();
      if (response.data) {
        setConversations(response.data);
        // If we have conversations, select the most recent one (first one)
        if (response.data.length > 0 && !conversation) {
          const mostRecent = response.data[0];
          setConversation(mostRecent);
          setChatMode(mostRecent.chat_mode || 'ai');
        }
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setConversation(null);
    setMessages([]);
    setChatMode('ai');
    setNewMessage('');
    setShowSidebar(false); // Close sidebar on mobile
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
    }
  };

  const handleSelectConversation = (conv: ChatConversation) => {
    if (conversation?.id === conv.id) {
        setShowSidebar(false);
        return;
    }
    setConversation(conv);
    setChatMode(conv.chat_mode || 'ai');
    setMessages([]); // Clear current messages while loading
    setNewMessage('');
    setShowSidebar(false); // Close sidebar on mobile
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
      
      // Store conversation ID before sending (could be null)
      const currentConvId = conversation?.id;

      // If we're creating a new conversation, we won't have an ID yet
      // The backend will create one and return the message with the new conversation_id

      const messageResponse = await chatAPI.sendMessage({
        conversation_id: currentConvId, // Pass null/undefined for new conversation
        message: textToSend.trim(),
      });
      
      // If this was a new conversation, we need to refresh the list and set the active conversation
      if (!currentConvId) {
        // The message response contains the conversation_id
        const newConvId = messageResponse.data.conversation_id;
        // Refresh conversations to get the new one in the list
        await loadConversations();
        
        // We need to find the new conversation in the list we just fetched
        // But since state updates are async, we might not have the new list immediately available in 'conversations'
        // So we'll optimistically set it or just rely on the re-render from loadConversations if we selected it there?
        // Actually loadConversations only selects if !conversation.
        // Let's fetch specifically to be sure
        const convsResponse = await chatAPI.getConversations();
        if (convsResponse.data) {
             setConversations(convsResponse.data);
             const newConv = convsResponse.data.find(c => c.id === newConvId);
             if (newConv) {
                 setConversation(newConv);
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
      
      const currentConvId = conversation?.id;

      const messageResponse = await chatAPI.sendMessage({
        conversation_id: currentConvId,
        message: `File: ${uploadResponse.data.file_name}`,
        message_type: uploadResponse.data.message_type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name,
        file_size: uploadResponse.data.file_size,
      });

       if (!currentConvId) {
        const newConvId = messageResponse.data.conversation_id;
        const convsResponse = await chatAPI.getConversations();
        if (convsResponse.data) {
             setConversations(convsResponse.data);
             const newConv = convsResponse.data.find(c => c.id === newConvId);
             if (newConv) {
                 setConversation(newConv);
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
    <div className={`customer-chat-page ${!conversation ? 'is-empty' : ''}`}>
      {/* Sidebar */}
      <div className={`chat-sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
            <button className="new-chat-btn" onClick={handleNewChat}>
                <FaPlus /> New Chat
            </button>
        </div>
        <div className="sidebar-conversations">
            <div className="conversations-list">
                {conversations.map((conv) => (
                    <div 
                        key={conv.id} 
                        className={`conversation-item ${conversation?.id === conv.id ? 'active' : ''}`}
                        onClick={() => handleSelectConversation(conv)}
                    >
                        <FaComment className="conv-icon" />
                        <div className="conv-details">
                            <span className="conv-title">
                                Conversation {new Date(conv.created_at).toLocaleDateString()}
                            </span>
                            <span className="conv-date">
                                {new Date(conv.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        {/* Mobile Close Button */}
        <button className="sidebar-close-btn" onClick={() => setShowSidebar(false)}>
            <FaTimes />
        </button>
      </div>

      {/* Overlay for mobile sidebar */}
      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}

      {/* Main Chat Area */}
      <div className="chat-main-area">
        <div className="customer-chat-header">
            <div className="header-left">
            <button className="sidebar-toggle-btn" onClick={() => setShowSidebar(true)}>
                <FaBars />
            </button>
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
            {!conversation || messages.length === 0 ? (
                <div className="empty-state-container">
                <div className="greeting">
                    <h2>Hello,</h2>
                    <p>How can I help you today?</p>
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
                    <div className="message ai-message">
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
    </div>
  );
};

export default CustomerChatPage;
