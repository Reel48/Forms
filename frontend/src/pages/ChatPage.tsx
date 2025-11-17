import React, { useState, useEffect, useRef } from 'react';
import { chatAPI, type ChatConversation, type ChatMessage } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      markAllAsRead(selectedConversation.id);
      subscribeToMessages(selectedConversation.id);
    }
    return () => {
      // Cleanup subscription when conversation changes
    };
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await chatAPI.getMessages(conversationId);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const subscribeToMessages = (conversationId: string) => {
    // Subscribe to new messages via Supabase Realtime
    const channel = supabase
      .channel(`chat_messages:${conversationId}`)
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
          // Refresh conversations to update last_message_at
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

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
      // Messages will be updated via realtime subscription
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

            <div className="messages-container">
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

