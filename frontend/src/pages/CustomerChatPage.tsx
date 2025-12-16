import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { chatAPI, realtimeAPI, type ChatMessage, type ChatConversation } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getRealtimeClient } from '../lib/supabase';
import { FaPaperclip, FaSun, FaMoon, FaArrowUp, FaPlus, FaArrowLeft, FaMicrophone, FaStop } from 'react-icons/fa';
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
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
  const voiceWsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceVizRafRef = useRef<number | null>(null);
  const voiceVizLevelRef = useRef<number>(0);
  const voiceVizSpeakingRef = useRef<boolean>(false);
  const voiceVizUiLevelRef = useRef<number>(0);
  const voiceVizUiSpeakingRef = useRef<boolean>(false);
  const voiceCanvasRef = useRef<HTMLCanvasElement>(null);
  const [voiceVizLevel, setVoiceVizLevel] = useState(0);
  const [voiceVizSpeaking, setVoiceVizSpeaking] = useState(false);

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
      // Cleanup voice if user navigates away
      void stopVoice();
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

  const getRealtimeWsUrl = () => {
    // Use the existing backend API URL and connect to the backend WebSocket endpoint.
    const apiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
    const base = (apiUrl || window.location.origin).replace(/\/+$/, '');
    if (base.startsWith('https://')) return `wss://${base.substring('https://'.length)}/api/realtime/ws/voice`;
    if (base.startsWith('http://')) return `ws://${base.substring('http://'.length)}/api/realtime/ws/voice`;
    if (base.startsWith('wss://') || base.startsWith('ws://')) return `${base}/api/realtime/ws/voice`;
    return `wss://${base}/api/realtime/ws/voice`;
  };

  const downsampleTo16kInt16 = (input: Float32Array, inputRate: number) => {
    const outputRate = 16000;
    if (outputRate === inputRate) {
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    }
    const ratio = inputRate / outputRate;
    const newLen = Math.floor(input.length / ratio);
    const out = new Int16Array(newLen);
    let offset = 0;
    for (let i = 0; i < newLen; i++) {
      const nextOffset = Math.floor((i + 1) * ratio);
      let acc = 0;
      let count = 0;
      for (let j = offset; j < nextOffset && j < input.length; j++) {
        acc += input[j];
        count++;
      }
      const avg = count ? acc / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      offset = nextOffset;
    }
    return out;
  };

  const playPcm16 = async (pcm16: ArrayBuffer, sampleRate: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const int16 = new Int16Array(pcm16);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextPlayTimeRef.current || now);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  };

  const stopVoiceVisualizer = () => {
    if (voiceVizRafRef.current != null) {
      cancelAnimationFrame(voiceVizRafRef.current);
      voiceVizRafRef.current = null;
    }
    analyserRef.current = null;
    voiceVizLevelRef.current = 0;
    voiceVizSpeakingRef.current = false;
    voiceVizUiLevelRef.current = 0;
    voiceVizUiSpeakingRef.current = false;
    setVoiceVizLevel(0);
    setVoiceVizSpeaking(false);
  };

  const startVoiceVisualizer = () => {
    const draw = () => {
      const analyser = analyserRef.current;
      const canvas = voiceCanvasRef.current;
      if (!analyser || !canvas) {
        voiceVizRafRef.current = requestAnimationFrame(draw);
        return;
      }

      const parent = canvas.parentElement;
      const cssWidth = parent ? parent.clientWidth : canvas.clientWidth;
      const cssHeight = parent ? parent.clientHeight : canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const nextW = Math.max(1, Math.floor(cssWidth * dpr));
      const nextH = Math.max(1, Math.floor(cssHeight * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }

      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) {
        voiceVizRafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Measure RMS (voice activity) from time-domain signal
      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const speaking = rms > 0.03;
      const targetLevel = Math.max(0, Math.min(1, (rms - 0.02) / 0.18));
      const smoothed = voiceVizLevelRef.current * 0.85 + targetLevel * 0.15;
      voiceVizLevelRef.current = smoothed;
      voiceVizSpeakingRef.current = speaking;

      // Update React state at a lower rate to avoid excess renders
      if (Math.abs(smoothed - voiceVizUiLevelRef.current) > 0.02) {
        voiceVizUiLevelRef.current = smoothed;
        setVoiceVizLevel(smoothed);
      }
      if (speaking !== voiceVizUiSpeakingRef.current) {
        voiceVizUiSpeakingRef.current = speaking;
        setVoiceVizSpeaking(speaking);
      }

      // Draw "audio waves": white with subtle gradient ripple
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const maxBar = h * 0.35 * smoothed;

      // Baseline (flat when silent)
      ctx2d.beginPath();
      ctx2d.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx2d.lineWidth = Math.max(1, 1.5 * dpr);
      ctx2d.moveTo(0, mid);
      ctx2d.lineTo(w, mid);
      ctx2d.stroke();

      if (maxBar > 0.5) {
        const freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);

        const bars = 56;
        const gap = Math.max(2 * dpr, 2);
        const barW = Math.max(3 * dpr, (w - (bars - 1) * gap) / bars);
        const grad = ctx2d.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.5, 'rgba(168,199,250,0.95)');
        grad.addColorStop(1, 'rgba(255,255,255,0.95)');

        ctx2d.lineCap = 'round';
        ctx2d.strokeStyle = grad;
        ctx2d.lineWidth = Math.max(2 * dpr, 2);

        let x = (w - (bars * barW + (bars - 1) * gap)) / 2;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * freq.length);
          const v = freq[idx] / 255;
          const barH = Math.max(0, v * maxBar);
          const y1 = mid - barH;
          const y2 = mid + barH;
          ctx2d.beginPath();
          ctx2d.moveTo(x + barW / 2, y1);
          ctx2d.lineTo(x + barW / 2, y2);
          ctx2d.stroke();
          x += barW + gap;
        }
      }

      voiceVizRafRef.current = requestAnimationFrame(draw);
    };

    if (voiceVizRafRef.current != null) return;
    voiceVizRafRef.current = requestAnimationFrame(draw);
  };

  const stopVoice = async () => {
    try {
      setVoiceActive(false);
      setVoiceError(null);
      if (voiceWsRef.current && voiceWsRef.current.readyState === WebSocket.OPEN) {
        voiceWsRef.current.send(JSON.stringify({ type: 'stop' }));
      }
      voiceWsRef.current?.close();
    } catch {
      // ignore
    } finally {
      stopVoiceVisualizer();
      voiceWsRef.current = null;
      try {
        processorRef.current?.disconnect();
      } catch {}
      processorRef.current = null;
      try {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      micStreamRef.current = null;
      try {
        await audioCtxRef.current?.close();
      } catch {}
      audioCtxRef.current = null;
      nextPlayTimeRef.current = 0;
    }
  };

  const startVoice = async () => {
    try {
      setVoiceError(null);
      const wsUrl = getRealtimeWsUrl();
      if (!wsUrl) {
        setVoiceError('Voice service is not configured.');
        return;
      }
      if (!conversation?.id) {
        setVoiceError('No conversation loaded yet.');
        return;
      }

      const tokenResp = await realtimeAPI.mintToken();
      const token = tokenResp.data?.token;
      if (!token) {
        setVoiceError('Failed to get voice token.');
        return;
      }

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      nextPlayTimeRef.current = ctx.currentTime + 0.1;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;
      source.connect(analyser);
      startVoiceVisualizer();
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const ws = new WebSocket(`${wsUrl}?conversation_id=${encodeURIComponent(conversation.id)}`);
      voiceWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', token }));
        setVoiceActive(true);
      };
      ws.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'audio' && msg.data) {
            const bin = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0)).buffer;
            await playPcm16(bin, msg.rate || 16000);
          } else if (msg.type === 'error') {
            setVoiceError(msg.message || 'Voice error');
            void stopVoice();
          }
        } catch {
          // ignore
        }
      };
      ws.onerror = () => {
        setVoiceError('Voice connection error.');
        void stopVoice();
      };
      ws.onclose = () => {
        setVoiceActive(false);
      };

      // Mic -> WS
      let carry: Int16Array | null = null;
      processor.onaudioprocess = (e) => {
        const socket = voiceWsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = downsampleTo16kInt16(input, ctx.sampleRate);
        const frameSamples = 320; // 20ms @ 16k

        let data: Int16Array;
        if (carry && carry.length) {
          data = new Int16Array(carry.length + pcm16.length);
          data.set(carry, 0);
          data.set(pcm16, carry.length);
        } else {
          data = pcm16;
        }

        let offset = 0;
        while (offset + frameSamples <= data.length) {
          const frame = data.subarray(offset, offset + frameSamples);
          offset += frameSamples;
          const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
          let b64 = '';
          // fast-ish base64
          for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
          socket.send(JSON.stringify({ type: 'audio', data: btoa(b64) }));
        }
        carry = offset < data.length ? data.subarray(offset) : null;
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (e: any) {
      setVoiceError(e?.message || 'Failed to start voice.');
      await stopVoice();
    }
  };

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
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string, limit: number = 50) => {
    try {
      const response = await chatAPI.getMessages(conversationId, limit);
      setMessages(response.data);
      setHasMoreMessages(response.data.length === limit);
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
        const newConvId = messageResponse.data?.conversation_id;
        if (newConvId) {
          try {
            const convsResponse = await chatAPI.getConversations();
            if (convsResponse.data) {
              const newConv = convsResponse.data.find(c => c.id === newConvId);
              if (newConv) {
                setConversation(newConv);
                await loadMessages(newConvId);
                setupRealtimeSubscriptions(newConvId);
              } else {
                console.warn('Conversation not found after creation:', newConvId);
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
    } catch (error) {
      console.error('Failed to send message:', error);
      showNotification({ type: 'error', message: 'Failed to send message. Please try again.' });
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
        <div className="customer-chat-loading">Loading chat...</div>
      </div>
    );
  }

  const hasTextToSend = Boolean(newMessage.trim());

  return (
    <div className={`customer-chat-page ${voiceActive ? 'voice-mode' : ''}`}>
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
                You’re chatting with human support. AI replies are paused.
              </div>
            )}
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
                {loadingMore && (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
                    Loading older messages...
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
                              <div className="typing-dot"></div>
                              <div className="typing-dot"></div>
                              <div className="typing-dot"></div>
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
              className={`send-btn ${hasTextToSend || voiceActive ? 'active' : ''}`}
              onClick={() => {
                if (hasTextToSend) {
                  void sendMessage();
                  return;
                }
                if (voiceActive) {
                  void stopVoice();
                } else {
                  void startVoice();
                }
              }}
              disabled={sending || uploading || (!hasTextToSend && !conversation?.id)}
              title={
                hasTextToSend
                  ? 'Send message'
                  : voiceActive
                  ? 'Stop voice'
                  : 'Talk to AI'
              }
            >
              {hasTextToSend ? <FaArrowUp /> : voiceActive ? <FaStop /> : <FaMicrophone />}
            </button>
          </div>
          {voiceError && (
            <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '0.9rem' }}>
              {voiceError}
            </div>
          )}
        </div>
      </div>

      {voiceActive && (
        <div className="voice-overlay" role="dialog" aria-label="Live voice chat">
          <div className="voice-overlay-panel">
            <div className="voice-overlay-top">
              <div className="voice-overlay-title">
                Live voice chat
                <span className="voice-overlay-subtitle">
                  {voiceVizSpeaking ? 'Listening…' : voiceVizLevel > 0.1 ? 'Listening…' : 'Say something…'}
                </span>
              </div>
              <button type="button" className="voice-overlay-stop" onClick={() => void stopVoice()}>
                <FaStop /> End
              </button>
            </div>

            <div className="voice-wave-wrap" aria-hidden="true">
              <canvas ref={voiceCanvasRef} className="voice-wave-canvas" />
            </div>

            <div className="voice-overlay-hint">You can keep typing while voice is on.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerChatPage;
