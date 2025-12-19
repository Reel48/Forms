import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { chatAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon, FaArrowUp, FaPlus, FaArrowLeft } from 'react-icons/fa';
import { ChatMessageBody } from '../components/chat/ChatMessageBody';
import { useNotifications } from '../components/NotificationSystem';
import './CustomerChatPage.css';

const CustomerChatPage: React.FC = () => {
  const { user } = useAuth();
  const { showNotification } = useNotifications();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved as 'dark' | 'light') || 'light';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const markingAsReadRef = useRef(false);
  const lastMarkAsReadRef = useRef<number>(0);
  const messagesSubscriptionRef = useRef<any>(null);
  const conversationsSubscriptionRef = useRef<any>(null);
  const sessionCheckIntervalRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

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
    const setupData = {location:'CustomerChatPage.tsx:54',message:'setupRealtimeSubscriptions called',data:{conversationId},timestamp:Date.now(),hypothesisId:'G'};
    console.log('🔍 [DEBUG]', JSON.stringify(setupData));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...setupData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
    // #endregion
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
          const newMsg = payload.new as ChatMessage | undefined;
          const oldMsg = payload.old as ChatMessage | undefined;
          const realtimeData = {location:'CustomerChatPage.tsx:77',message:'Realtime message event received',data:{eventType:payload.eventType,hasNew:!!payload.new,hasOld:!!payload.old,messageId:newMsg?.id||oldMsg?.id,senderId:newMsg?.sender_id||oldMsg?.sender_id},timestamp:Date.now(),hypothesisId:'G'};
          console.log('🔍 [DEBUG]', JSON.stringify(realtimeData));
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...realtimeData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
          // #endregion
          
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as ChatMessage;
            
            // Enhanced logging for AI response tracking
            const messageData = {location:'CustomerChatPage.tsx:91',message:'Realtime INSERT - new message received',data:{messageId:newMessage.id,senderId:newMessage.sender_id,messageType:newMessage.message_type,messagePreview:newMessage.message?.substring(0,50)||'[no message]',isFromCustomer:newMessage.sender_id===user?.id},timestamp:Date.now(),hypothesisId:'G'};
            console.log('🔍 [DEBUG]', JSON.stringify(messageData));
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...messageData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
            // #endregion
            
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
        const subData = {location:'CustomerChatPage.tsx:113',message:'Realtime messages subscription status',data:{status,conversationId},timestamp:Date.now(),hypothesisId:'G'};
        console.log('🔍 [DEBUG]', JSON.stringify(subData));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...subData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
        // #endregion
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to chat messages via Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to chat messages:', status);
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
      const realtimeClient = getRealtimeClient();
      if (messagesSubscriptionRef.current) {
        realtimeClient.removeChannel(messagesSubscriptionRef.current);
        messagesSubscriptionRef.current = null;
      }
      if (conversationsSubscriptionRef.current) {
        realtimeClient.removeChannel(conversationsSubscriptionRef.current);
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CustomerChatPage.tsx:176',message:'checkSession entry',data:{conversationId,conversationIdFromConversation:conversation?.id,hasConversation:!!conversation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const sessionId = conversationId || conversation?.id;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CustomerChatPage.tsx:178',message:'before API call',data:{sessionId,requestBody:sessionId?{conversation_id:sessionId}:{}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const response = await chatAPI.checkSession(sessionId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CustomerChatPage.tsx:179',message:'after API call success',data:{status:response.status,hasData:!!response.data,wasReset:response.data?.was_reset},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (response.data.was_reset) {
        const resetData = {location:'CustomerChatPage.tsx:190',message:'session was reset - clearing messages',data:{conversationId:conversation?.id,messagesCountBeforeClear:messages.length},timestamp:Date.now(),hypothesisId:'F'};
        console.log('🔍 [DEBUG]', JSON.stringify(resetData));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...resetData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
        // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CustomerChatPage.tsx:194',message:'checkSession error',data:{errorType:error?.constructor?.name,errorMessage:error?.message||String(error),errorResponse:error?.response?.data,statusCode:error?.response?.status,fullError:JSON.stringify(error,Object.getOwnPropertyNames(error)).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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
    const loadData = {location:'CustomerChatPage.tsx:377',message:'loadConversation called',data:{},timestamp:Date.now(),hypothesisId:'F'};
    console.log('🔍 [DEBUG]', JSON.stringify(loadData));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...loadData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
    // #endregion
    try {
      setLoading(true);
      const response = await chatAPI.getConversations();
      const responseData = {location:'CustomerChatPage.tsx:380',message:'loadConversation API success',data:{hasData:!!response?.data,conversationCount:response?.data?.length||0,firstConversationId:response?.data?.[0]?.id},timestamp:Date.now(),hypothesisId:'F'};
      console.log('🔍 [DEBUG]', JSON.stringify(responseData));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...responseData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
      if (response.data && response.data.length > 0) {
        // Use the most recent conversation
        setConversation(response.data[0]);
      } else {
        // Conversation will be created on first message
        setConversation(null);
      }
    } catch (error: any) {
      const loadErrorData = {location:'CustomerChatPage.tsx:390',message:'loadConversation error',data:{errorType:error?.constructor?.name,errorMessage:error instanceof Error ? error.message : String(error),errorResponse:error?.response?.data,statusCode:error?.response?.status},timestamp:Date.now(),hypothesisId:'F'};
      console.error('🔍 [DEBUG]', JSON.stringify(loadErrorData));
      console.error('Failed to load conversation:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...loadErrorData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
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
    const sendData = {location:'CustomerChatPage.tsx:412',message:'sendMessage called',data:{hasText:!!textToSend?.trim(),textLength:textToSend?.trim()?.length||0,sending,hasConversation:!!conversation,conversationId:conversation?.id},timestamp:Date.now(),hypothesisId:'F'};
    console.log('🔍 [DEBUG]', JSON.stringify(sendData));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sendData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
    // #endregion
    
    if (!textToSend.trim() || sending) {
      const blockedData = {location:'CustomerChatPage.tsx:415',message:'sendMessage blocked',data:{reason:!textToSend.trim()?'no text':'already sending',sending},timestamp:Date.now(),hypothesisId:'F'};
      console.log('🔍 [DEBUG]', JSON.stringify(blockedData));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...blockedData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
      return;
    }

    try {
      setSending(true);
      const startData = {location:'CustomerChatPage.tsx:420',message:'sendMessage starting',data:{messagePayload:messageText?{message:messageText.trim()}:{message:textToSend.trim(),conversation_id:conversation?.id}},timestamp:Date.now(),hypothesisId:'F'};
      console.log('🔍 [DEBUG]', JSON.stringify(startData));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...startData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
      
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
      const successData = {location:'CustomerChatPage.tsx:432',message:'sendMessage API success',data:{hasResponse:!!messageResponse,hasData:!!messageResponse?.data,conversationId:messageResponse?.data?.conversation_id},timestamp:Date.now(),hypothesisId:'F'};
      console.log('🔍 [DEBUG]', JSON.stringify(successData));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...successData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
      
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
      
      // Show thinking indicator - AI will respond automatically
      if (!messageText) {
        setNewMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = '24px';
        }
      }
    } catch (error: any) {
      const errorData = {location:'CustomerChatPage.tsx:490',message:'sendMessage error',data:{errorType:error?.constructor?.name,errorMessage:error instanceof Error ? error.message : String(error),errorResponse:error?.response?.data,statusCode:error?.response?.status},timestamp:Date.now(),hypothesisId:'F'};
      console.error('🔍 [DEBUG]', JSON.stringify(errorData));
      console.error('Failed to send message:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...errorData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
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
      showNotification({ type: 'error', message: 'Failed to upload file. Please try again.' });
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
        <div className="customer-chat-loading">
          <div className="loading-spinner"></div>
          <span>Loading chat...</span>
        </div>
      </div>
    );
  }

  const hasTextToSend = Boolean(newMessage.trim());

  return (
    <div className="customer-chat-page">
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
            {(() => {
              const uiState = {location:'CustomerChatPage.tsx:615',message:'UI render state',data:{loading,hasConversation:!!conversation,conversationId:conversation?.id,messagesCount:messages.length,sending,uploading},timestamp:Date.now(),hypothesisId:'F'};
              console.log('🔍 [DEBUG]', JSON.stringify(uiState));
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...uiState,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
              // #endregion
              return null;
            })()}
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
                {messages.map((message) => {
                  const isCustomer = message.sender_id === user?.id;
                  
                  return (
                    <div
                      key={message.id}
                      className={`message ${isCustomer ? 'user-message' : 'ai-message'}`}
                    >
                      <div className="message-wrapper">
                        <div className="message-sender-name">
                          {isCustomer ? 'You' : 'Reel48 AI'}
                        </div>
                        <div className="message-content">
                          {!isCustomer && message.message_type === 'system' ? (
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
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                style={{
                  position: 'absolute',
                  top: '-44px',
                  right: '16px',
                  padding: '8px 12px',
                  borderRadius: '999px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--brand-white)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Jump to latest
              </button>
            )}
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
              type="button"
              className={`send-btn ${hasTextToSend ? 'active' : ''}`}
              onClick={() => {
                if (!hasTextToSend) return;
                void sendMessage();
              }}
              disabled={sending || uploading || !hasTextToSend}
              title="Send message"
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
