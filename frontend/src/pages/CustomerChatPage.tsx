import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FaSun, FaMoon, FaArrowUp, FaArrowLeft, FaCopy, FaCheck } from 'react-icons/fa';
import { ChatMessageBody } from '../components/chat/ChatMessageBody';
import { useNotifications } from '../components/NotificationSystem';
import { createTextStream } from '../lib/streaming';
import './CustomerChatPage.css';

const CustomerChatPage: React.FC = () => {
  const { user } = useAuth();
  const { showNotification } = useNotifications();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved as 'dark' | 'light') || 'light';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markingAsReadRef = useRef(false);
  const lastMarkAsReadRef = useRef<number>(0);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);
  const sessionCheckIntervalRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const streamingMessageRef = useRef<{ id: string; content: string } | null>(null);
  const isStreamingRef = useRef(false);

  // Load messages function - defined early so it can be used in other callbacks
  const loadMessages = useCallback(async (conversationId: string, limit: number = 50) => {
    try {
      const response = await chatAPI.getMessages(conversationId, limit);
      setMessages(response.data);
      setHasMoreMessages(response.data.length === limit);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, []);

  // Setup Realtime subscriptions for messages and conversations
  const setupRealtimeSubscriptions = useCallback(async (conversationId: string) => {
    // Verify user is authenticated before subscribing
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || sessionError) {
      console.warn('Cannot setup Realtime subscriptions: user not authenticated', sessionError);
      return;
    }

    // Explicitly set the session to ensure Realtime has access to the token
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    // Use main supabase client which automatically includes access token for RLS
    const realtimeClient = supabase;

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
            
            // Skip system placeholder messages if we're streaming
            // Frontend handles streaming UI, so we don't need backend placeholders
            if (isStreamingRef.current && 
                newMessage.message_type === 'system' && 
                newMessage.sender_id !== user?.id) {
              return; // Ignore placeholder when streaming
            }
            
            // If this is an AI message and we have a streaming message, replace it
            // This handles the case where Realtime delivers the final message
            if (newMessage.sender_id !== user?.id && 
                newMessage.message_type === 'text' &&
                newMessage.message && newMessage.message.length > 0 &&
                streamingMessageRef.current) {
              setMessages((prev) => {
                // Check if message already exists (avoid duplicates)
                if (prev.some((msg) => msg.id === newMessage.id)) {
                  // Message already exists, just remove streaming message
                  return prev.filter((msg) => msg.id !== streamingMessageRef.current!.id);
                }
                // Remove the streaming message and add the real one
                return prev
                  .filter((msg) => msg.id !== streamingMessageRef.current!.id)
                  .concat(newMessage);
              });
              streamingMessageRef.current = null;
              lastActivityRef.current = Date.now();
              return;
            }
            
            // Track activity when receiving messages
            lastActivityRef.current = Date.now();
            
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
            setMessages((prev) => {
              const filtered = prev.filter((msg) => msg.id !== deletedMessage.id);
              // If all messages were deleted (likely session reset), clear the list
              if (filtered.length === 0 && prev.length > 0) {
                // This might be a bulk delete, reload messages to be sure
                setTimeout(() => {
                  void loadMessages(conversationId);
                }, 100);
              }
              return filtered;
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to chat messages via Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to chat messages:', status);
          console.error('💡 This may be due to:');
          console.error('   1. WebSocket connection failure (check for %0A in URL - indicates newline in anon key)');
          console.error('   2. RLS policy blocking subscription (check Supabase dashboard)');
          console.error('   3. Realtime not enabled for chat_messages table');
          console.error('   Fix: Update VITE_SUPABASE_ANON_KEY in Vercel (remove any newlines/whitespace)');
        }
      });

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
  }, [user?.id, loadMessages]); // Removed conversation?.id - using conversationId parameter instead

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
      if (messagesSubscriptionRef.current) {
        supabase.removeChannel(messagesSubscriptionRef.current);
        messagesSubscriptionRef.current = null;
      }
      if (conversationsSubscriptionRef.current) {
        supabase.removeChannel(conversationsSubscriptionRef.current);
        conversationsSubscriptionRef.current = null;
      }
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    };
  }, []);

  // Check session on mount and when conversation loads
  const checkSession = useCallback(async (conversationId?: string) => {
    if (!conversationId && !conversation?.id) return;
    
    try {
      const sessionId = conversationId || conversation?.id;
      const response = await chatAPI.checkSession(sessionId);
      
      if (response.data.was_reset) {
        // Session was reset, clear messages and reload (will be empty)
        // Silent reset - no notification shown to user
        setMessages([]);
        if (conversation?.id) {
          // Small delay to ensure backend has finished deleting
          await new Promise(resolve => setTimeout(resolve, 200));
          await loadMessages(conversation.id);
          // Notification removed per user request
        }
      }
    } catch (error: any) {
      console.error('Failed to check session:', error);
      // Don't show error to user - session check failures are non-critical
    }
  }, [conversation?.id, showNotification, loadMessages]);

  useEffect(() => {
    if (conversation) {
      loadMessages(conversation.id);
      setupRealtimeSubscriptions(conversation.id);
      markAllAsRead();
      // Don't check session on initial load - it's too aggressive and clears messages
      // Session will be checked periodically and when sending messages
      
      // Check AI service status for diagnostics
      chatAPI.getAiStatus().then((response) => {
        const status = response.data;
        if (!status.ai_service_available) {
          console.warn('⚠️ AI service is not available:', {
            hasGeminiKey: status.has_gemini_key,
            ochoUserIdValid: status.ocho_user_id_valid,
            ochoUserId: status.ocho_user_id
          });
        }
      }).catch((error) => {
        // Endpoint might not exist yet if backend hasn't been deployed
        console.debug('AI status check failed (this is OK if backend not deployed yet):', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]); // Only depend on conversation?.id to avoid infinite loops

  // Periodic session check (every 30 seconds)
  useEffect(() => {
    if (!conversation?.id) return;
    
    // Set up interval for periodic session checks
    sessionCheckIntervalRef.current = setInterval(() => {
      checkSession(conversation.id);
    }, 30000); // 30 seconds
    
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]); // Only depend on conversation?.id, checkSession is stable

  // Track page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && conversation?.id) {
        // User returned to page, check session
        lastActivityRef.current = Date.now();
        checkSession(conversation.id);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]); // Only depend on conversation?.id, checkSession is stable


  useEffect(() => {
    if (shouldAutoScroll && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  const checkIfNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setShouldAutoScroll(nearBottom);
    return nearBottom;
  }, []);

  const loadMoreMessages = useCallback(async (conversationId: string) => {
    if (loadingMore || !hasMoreMessages) return;
    const oldest = messages[0];
    if (!oldest) return;
    try {
      setLoadingMore(true);
      const container = messagesContainerRef.current;
      const previousScrollHeight = container?.scrollHeight || 0;

      const response = await chatAPI.getMessages(conversationId, 50, oldest.id);
      const older = response.data;
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        setHasMoreMessages(older.length === 50);
        // Restore scroll position so the list doesn't jump.
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
      console.error('Failed to load older messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMoreMessages, loadingMore, messages]);

  // Scroll listener: disable auto-scroll if user is reading older messages.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      checkIfNearBottom();
      if (container.scrollTop === 0 && hasMoreMessages && !loadingMore && conversation?.id) {
        void loadMoreMessages(conversation.id);
      }
    };

    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [checkIfNearBottom, hasMoreMessages, loadingMore, conversation?.id, loadMoreMessages]);

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
    } catch (error: any) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
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
    
    if (!textToSend.trim() || sending) {
      return;
    }

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

      // Track activity when sending message
      lastActivityRef.current = Date.now();
      
      const messageResponse = await chatAPI.sendMessage(messagePayload);
      
      // Get the conversation_id from the response
      const responseConvId = messageResponse.data?.conversation_id;
      
      // If this was a new conversation, or if the conversation_id changed (conversation was deleted and recreated), set it up
      if (!conversation?.id || (responseConvId && responseConvId !== conversation.id)) {
        if (responseConvId) {
          try {
            const convsResponse = await chatAPI.getConversations();
            if (convsResponse.data) {
              const newConv = convsResponse.data.find(c => c.id === responseConvId);
              if (newConv) {
                setConversation(newConv);
                await loadMessages(responseConvId);
                setupRealtimeSubscriptions(responseConvId);
              } else {
                console.warn('Conversation not found after creation:', responseConvId);
                // Reload conversations to get the new one
                const updatedConvsResponse = await chatAPI.getConversations();
                if (updatedConvsResponse.data && updatedConvsResponse.data.length > 0) {
                  const latestConv = updatedConvsResponse.data[0];
                  setConversation(latestConv);
                  await loadMessages(latestConv.id);
                  setupRealtimeSubscriptions(latestConv.id);
                }
              }
            }
          } catch (error) {
            console.error('Error setting up new conversation:', error);
            // Don't fail the message send - just log the error
          }
        } else {
          console.warn('No conversation_id in message response, fetching conversations');
          // Fallback: fetch conversations to get the newly created one
          try {
            const convsResponse = await chatAPI.getConversations();
            if (convsResponse.data && convsResponse.data.length > 0) {
              const latestConv = convsResponse.data[0];
              setConversation(latestConv);
              await loadMessages(latestConv.id);
              setupRealtimeSubscriptions(latestConv.id);
            }
          } catch (error) {
            console.error('Error fetching conversations after message send:', error);
          }
        }
      }
      
      // Get final conversation ID for streaming
      const finalConversationId = responseConvId || conversation?.id;
      
      // Clear input
      if (!messageText) {
        setNewMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = '24px';
        }
      }
      
      // Start streaming AI response if we have a conversation
      if (finalConversationId && !isStreamingRef.current) {
        // Small delay to ensure the user message is visible first
        setTimeout(() => {
          void streamAIResponse(finalConversationId);
        }, 500);
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message. Please try again.';
      showNotification({ type: 'error', message: errorMessage });
      
      // If it's a session expiration error, check session
      if (errorMessage.includes('session') || errorMessage.includes('expired')) {
        if (conversation?.id) {
          void checkSession(conversation.id);
        }
      }
    } finally {
      setSending(false);
    }
  };

  // Stream AI response function
  const streamAIResponse = async (conversationId: string) => {
    if (isStreamingRef.current) {
      console.log('Already streaming, skipping');
      return;
    }

    try {
      isStreamingRef.current = true;
      
      // Get auth token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No auth token available for streaming');
        return;
      }

      // Create a temporary streaming message ID
      const streamingMessageId = `streaming-${Date.now()}`;
      const streamingMessage: ChatMessage = {
        id: streamingMessageId,
        conversation_id: conversationId,
        sender_id: 'ai-streaming', // Temporary ID
        message: '',
        message_type: 'text',
        created_at: new Date().toISOString(),
        read_at: undefined,
        file_url: undefined,
        file_name: undefined,
      };

      // Add streaming message to UI
      setMessages((prev) => [...prev, streamingMessage]);
      streamingMessageRef.current = { id: streamingMessageId, content: '' };

      // Start streaming
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/chat/conversations/${conversationId}/ai-response-stream`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Accept': 'text/event-stream',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Streaming failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process the stream
      console.log('[STREAMING] Starting to process stream...');
      const stream = await createTextStream(response.body);
      let accumulatedContent = '';
      let chunkCount = 0;

      for await (const update of stream) {
        console.log('[STREAMING] Received update:', { 
          done: update.done, 
          hasValue: !!update.value, 
          valueLength: update.value?.length || 0,
          valuePreview: update.value?.substring(0, 50) || '',
          hasError: !!update.error,
          error: update.error
        });

        if (update.done) {
          console.log('[STREAMING] Stream completed. Total chunks:', chunkCount, 'Total length:', accumulatedContent.length);
          break;
        }

        if (update.error) {
          console.error('[STREAMING] Streaming error:', update.error);
          // Update message with error
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessageId
                ? { ...msg, message: 'Sorry, I encountered an error. Please try again.' }
                : msg
            )
          );
          break;
        }

        if (update.value) {
          chunkCount++;
          accumulatedContent += update.value;
          console.log(`[STREAMING] Chunk ${chunkCount}: "${update.value}" | Accumulated: ${accumulatedContent.length} chars | Preview: "${accumulatedContent.substring(0, 100)}"`);
          
          // Update the streaming message in real-time
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === streamingMessageId
                ? { ...msg, message: accumulatedContent }
                : msg
            );
            console.log('[STREAMING] Updated message in state. Message found:', updated.some(msg => msg.id === streamingMessageId && msg.message.length > 0));
            return updated;
          });

          // Auto-scroll to bottom while streaming
          if (shouldAutoScroll) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 0);
          }
        } else {
          console.log('[STREAMING] Update has no value (usage or empty delta)');
        }
      }

      console.log('[STREAMING] Stream processing complete. Final content length:', accumulatedContent.length);

      // Streaming complete - the backend has saved the final message to the database
      // Keep the streaming message visible with the accumulated content
      // Realtime will replace it when the final message arrives (handled in INSERT handler above)
      // If Realtime doesn't deliver within 3 seconds, keep the streaming message (it has the content)
      if (accumulatedContent && accumulatedContent.length > 0) {
        // Ensure the streaming message has the final content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? { ...msg, message: accumulatedContent }
              : msg
          )
        );
        
        // Set a timeout to clean up if Realtime doesn't deliver
        setTimeout(() => {
          setMessages((prev) => {
            // Check if we have the final message from Realtime (with a different ID)
            const hasFinalMessage = prev.some(
              (msg) => 
                msg.conversation_id === conversationId &&
                msg.sender_id !== user?.id &&
                msg.id !== streamingMessageId &&
                msg.message_type === 'text' &&
                msg.message && msg.message.length > 0
            );
            
            if (hasFinalMessage) {
              // Realtime delivered the final message - remove the streaming message
              return prev.filter((msg) => msg.id !== streamingMessageId);
            }
            // Otherwise keep the streaming message - it has the content
            return prev;
          });
          streamingMessageRef.current = null;
        }, 3000); // Give Realtime 3 seconds to deliver the message
      } else {
        // No content - remove the blank message immediately
        setMessages((prev) => prev.filter((msg) => msg.id !== streamingMessageId));
        streamingMessageRef.current = null;
      }

    } catch (error) {
      console.error('Failed to stream AI response:', error);
      // Remove streaming message on error
      if (streamingMessageRef.current) {
        setMessages((prev) => prev.filter((msg) => msg.id !== streamingMessageRef.current!.id));
        streamingMessageRef.current = null;
      }
    } finally {
      isStreamingRef.current = false;
    }
  };


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Format timestamp for display
  const formatTimestamp = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
      
    // For older messages, show date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format date for separator
  const formatDateSeparator = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Check if messages should be grouped
  const shouldGroupMessages = (current: ChatMessage, previous: ChatMessage | null): boolean => {
    if (!previous) return false;
    if (current.sender_id !== previous.sender_id) return false;
    
    const currentTime = new Date(current.created_at).getTime();
    const previousTime = new Date(previous.created_at).getTime();
    const diffMinutes = (currentTime - previousTime) / 60000;
    
    return diffMinutes < 2; // Group if within 2 minutes
  };

  // Copy message to clipboard
  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.message);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
      showNotification({ type: 'success', message: 'Message copied to clipboard' });
    } catch (error) {
      console.error('Failed to copy message:', error);
      showNotification({ type: 'error', message: 'Failed to copy message' });
    }
  };

  // Group messages and add date separators
  const renderMessages = () => {
    if (messages.length === 0) return null;

    const groupedMessages: Array<ChatMessage | { type: 'date-separator'; date: string }> = [];
    let lastDate = '';

    messages.forEach((message) => {
      const messageDate = new Date(message.created_at).toDateString();
      
      // Add date separator if needed
      if (messageDate !== lastDate) {
        groupedMessages.push({ type: 'date-separator', date: message.created_at });
        lastDate = messageDate;
      }

      groupedMessages.push(message);
    });

    return groupedMessages.map((item, index) => {
      if ('type' in item && item.type === 'date-separator') {
        return (
          <div key={`date-${item.date}`} className="date-separator">
            <span className="date-separator-text">{formatDateSeparator(item.date)}</span>
          </div>
        );
      }

      const message = item as ChatMessage;
      const isCustomer = message.sender_id === user?.id;
      const previousMessage = index > 0 && groupedMessages[index - 1] && !('type' in groupedMessages[index - 1])
        ? groupedMessages[index - 1] as ChatMessage
        : null;
      const isGroupStart = !shouldGroupMessages(message, previousMessage);
      const isGroupContinued = previousMessage && shouldGroupMessages(message, previousMessage);

      return (
        <div
          key={message.id}
          className={`message ${isCustomer ? 'user-message' : 'ai-message'} ${
            isGroupStart ? 'message-group-start' : ''
          } ${isGroupContinued ? 'message-group-continued' : ''}`}
        >
          <div className="message-wrapper">
            <div className="message-sender-name">
              {isCustomer ? 'You' : 'Reel48 AI'}
            </div>
            <div className="message-content">
              {!isCustomer && message.message_type === 'system' && !isStreamingRef.current ? (
                <div className="typing-indicator">
                  <span className="typing-text">AI is thinking...</span>
                  <div className="typing-dots">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              ) : (
                <ChatMessageBody message={message} renderAsMarkdown={!isCustomer} />
              )}
              <div className="message-actions">
                <button
                  className="message-action-btn"
                  onClick={() => copyMessage(message)}
                  title="Copy message"
                  aria-label="Copy message to clipboard"
                >
                  {copiedMessageId === message.id ? <FaCheck /> : <FaCopy />}
                </button>
              </div>
            </div>
            <div className="message-timestamp">
              {formatTimestamp(message.created_at)}
            </div>
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="customer-chat-page">
        <div className="customer-chat-loading">
          <div className="loading-spinner"></div>
          <span>Loading chat...</span>
        </div>
      </div>
    );
  }

  const hasTextToSend = Boolean(newMessage.trim());
  const isEmpty = !conversation || messages.length === 0;

  return (
    <div className={`customer-chat-page ${isEmpty ? 'is-empty' : ''}`}>
      {/* Main Chat Area */}
      <div className="chat-main-area">
        <div className="customer-chat-header">
          <div className="header-left">
            <Link to="/dashboard" className="back-to-dashboard-btn">
              <FaArrowLeft /> Back to dashboard
            </Link>
          </div>
          <div className="header-right">
            {conversation?.id && (
              <button
                onClick={async () => {
                  const nextMode = conversation?.chat_mode === 'human' ? 'ai' : 'human';
                  try {
                    await chatAPI.updateChatMode(conversation.id, nextMode);
                    setConversation((prev) => (prev ? { ...prev, chat_mode: nextMode } : prev));
                    showNotification({
                      type: 'success',
                      message: nextMode === 'human' ? 'Switched to human support mode' : 'Switched back to AI mode',
                    });
                  } catch (e) {
                    console.error('Failed to update chat mode:', e);
                    showNotification({ type: 'error', message: 'Failed to update chat mode. Please try again.' });
                  }
                }}
                className="theme-toggle-btn"
                title={conversation?.chat_mode === 'human' ? 'Switch back to AI' : 'Talk to a human'}
                style={{ marginRight: '0.5rem' }}
              >
                {conversation?.chat_mode === 'human' ? 'Use AI' : 'Talk to a human'}
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <FaSun /> : <FaMoon />}
            </button>
          </div>
        </div>

        <div className="customer-chat-messages" ref={messagesContainerRef}>
          <div className="message-width-limiter">
            {conversation?.chat_mode === 'human' && (
              <div style={{ padding: '0.75rem 1rem', margin: '0.75rem 0', borderRadius: '8px', background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)' }}>
                You're chatting with human support. AI replies are paused.
              </div>
            )}
            {!conversation || messages.length === 0 ? (
              <div className="empty-state-container">
                <div className="greeting">
                  <h2>Hello! 👋</h2>
                  <p>I'm Reel48's AI Assistant. How can I help you today?</p>
                  <p className="greeting-subtitle">Ask me about our products, get a quote, or schedule a meeting with our team.</p>
                </div>
                <div className="suggested-prompts">
                  <button className="prompt-chip" onClick={() => sendMessage("What does Reel48 do?")}>
                    <span className="prompt-icon"></span>
                    <span>What does Reel48 do?</span>
                  </button>
                  <button className="prompt-chip" onClick={() => sendMessage("How long will my hats take to be delivered?")}>
                    <span className="prompt-icon"></span>
                    <span>How long will my hats take to be delivered?</span>
                  </button>
                  <button className="prompt-chip" onClick={() => sendMessage("Give me a quote for 500 custom hats.")}>
                    <span className="prompt-icon"></span>
                    <span>Get a quote for 500 custom hats</span>
                  </button>
                </div>
              </div>
            ) : (
              <div id="chat-container">
                {loadingMore && (
                  <div className="loading-more-messages">
                    <div className="loading-spinner"></div>
                    <span>Loading older messages...</span>
                  </div>
                )}
                {renderMessages()}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="input-area-wrapper">
          <div className="input-island">
            {!shouldAutoScroll && (
              <button
                type="button"
                onClick={() => {
                  setShouldAutoScroll(true);
                  scrollToBottom();
                }}
                className="jump-to-latest-btn"
                aria-label="Jump to latest messages"
              >
                Jump to latest
              </button>
            )}
            
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
                } else if (e.key === 'Escape') {
                  setNewMessage('');
                  if (textareaRef.current) {
                    textareaRef.current.style.height = '24px';
                  }
                }
              }}
              disabled={sending}
              rows={1}
              aria-label="Message input"
              aria-describedby="message-input-help"
            />
            <span id="message-input-help" className="sr-only">
              Press Enter to send, Shift+Enter for new line, Escape to clear
            </span>

            <button
              type="button"
              className={`send-btn ${hasTextToSend ? 'active' : ''}`}
              onClick={() => {
                if (!hasTextToSend) return;
                void sendMessage();
              }}
              disabled={sending || !hasTextToSend}
              title="Send message"
              aria-label="Send message"
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
