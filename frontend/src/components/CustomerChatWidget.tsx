import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaComments } from 'react-icons/fa';
import { chatAPI, type ChatMessage } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import './CustomerChatWidget.css';

/**
 * Lightweight launcher widget for customers.
 * Canonical chat UX is the full page at `/chat`.
 */
const CustomerChatWidget: React.FC = () => {
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  
  const renderData = {location:'CustomerChatWidget.tsx:17',message:'CustomerChatWidget render',data:{renderCount:renderCountRef.current},timestamp:Date.now(),hypothesisId:'B'};
  console.log('🔍 [DEBUG]', JSON.stringify(renderData));
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...renderData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
  // #endregion
  
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesSubscriptionRef = useRef<any>(null);

  const refreshUnreadCount = useCallback(async (convId: string) => {
    try {
      // API caps at 100; good enough for badge.
      const response = await chatAPI.getMessages(convId, 100);
      const unread = response.data.filter((msg) => !msg.read_at && msg.sender_id !== user?.id && msg.message_type !== 'system').length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to refresh unread count:', error);
    }
  }, [user?.id]);

  const setupRealtime = useCallback((convId: string) => {
    const setupData = {location:'CustomerChatWidget.tsx:34',message:'setupRealtime called',data:{convId},timestamp:Date.now(),hypothesisId:'D'};
    console.log('🔍 [DEBUG]', JSON.stringify(setupData));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...setupData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
    // #endregion
    const realtimeClient = getRealtimeClient();
    if (messagesSubscriptionRef.current) {
      realtimeClient.removeChannel(messagesSubscriptionRef.current);
      messagesSubscriptionRef.current = null;
    }

    messagesSubscriptionRef.current = realtimeClient
      .channel(`chat_widget_messages:${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.sender_id !== user?.id && !msg.read_at && msg.message_type !== 'system') {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${convId}` },
        () => {
          // Keep badge accurate when messages get marked as read.
          void refreshUnreadCount(convId);
        }
      )
      .subscribe();
  }, [refreshUnreadCount, user?.id]);

  useEffect(() => {
    const effectData = {location:'CustomerChatWidget.tsx:64',message:'useEffect main init running',data:{hasRefreshUnreadCount:!!refreshUnreadCount,hasSetupRealtime:!!setupRealtime},timestamp:Date.now(),hypothesisId:'D'};
    console.log('🔍 [DEBUG]', JSON.stringify(effectData));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...effectData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
    // #endregion
    let mounted = true;
    const init = async () => {
      try {
        const convs = await chatAPI.getConversations();
        if (!mounted) return;
        const convId = convs.data?.[0]?.id || null;
        setConversationId(convId);
        if (convId) {
          await refreshUnreadCount(convId);
          setupRealtime(convId);
        } else {
          setUnreadCount(0);
        }
      } catch (error) {
        console.error('Failed to load conversation for widget:', error);
      }
    };
    void init();

    return () => {
      const cleanupData = {location:'CustomerChatWidget.tsx:84',message:'useEffect cleanup running',data:{hasSubscription:!!messagesSubscriptionRef.current},timestamp:Date.now(),hypothesisId:'E'};
      console.log('🔍 [DEBUG]', JSON.stringify(cleanupData));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0aea16b7-47e0-4efd-b91d-c07093d7e27d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...cleanupData,sessionId:'debug-session',runId:'run1'})}).catch(()=>{});
      // #endregion
      mounted = false;
      const realtimeClient = getRealtimeClient();
      if (messagesSubscriptionRef.current) {
        realtimeClient.removeChannel(messagesSubscriptionRef.current);
        messagesSubscriptionRef.current = null;
      }
    };
  }, [refreshUnreadCount, setupRealtime]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      void refreshUnreadCount(conversationId);
    }, 60000);
    return () => clearInterval(interval);
  }, [conversationId, refreshUnreadCount]);

  return (
    <button
      className="chat-widget-button"
      onClick={() => {
        setUnreadCount(0);
        navigate('/chat');
      }}
      title="Chat with Reel48"
    >
      <FaComments />
      {unreadCount > 0 && <span className="chat-widget-badge">{unreadCount}</span>}
    </button>
  );
};

export default CustomerChatWidget;

