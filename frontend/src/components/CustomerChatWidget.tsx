import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaComments } from 'react-icons/fa';
import { chatAPI, type ChatMessage } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './CustomerChatWidget.css';

/**
 * Lightweight launcher widget for customers.
 * Canonical chat UX is the full page at `/chat`.
 */
const CustomerChatWidget: React.FC = () => {
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

  const setupRealtime = useCallback(async (convId: string) => {
    // Verify user is authenticated before subscribing
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('Cannot setup Realtime subscription: user not authenticated');
      return;
    }

    // Use main supabase client which automatically includes access token for RLS
    if (messagesSubscriptionRef.current) {
      supabase.removeChannel(messagesSubscriptionRef.current);
      messagesSubscriptionRef.current = null;
    }

    messagesSubscriptionRef.current = supabase
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
    let mounted = true;
    const init = async () => {
      try {
        const convs = await chatAPI.getConversations();
        if (!mounted) return;
        const convId = convs.data?.[0]?.id || null;
        setConversationId(convId);
        if (convId) {
          await refreshUnreadCount(convId);
          await setupRealtime(convId);
        } else {
          setUnreadCount(0);
        }
      } catch (error) {
        console.error('Failed to load conversation for widget:', error);
      }
    };
    void init();

    return () => {
      mounted = false;
      if (messagesSubscriptionRef.current) {
        supabase.removeChannel(messagesSubscriptionRef.current);
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

