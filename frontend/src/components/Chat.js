import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Send, MessageCircle, GripVertical, ChevronUp, Minimize2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { useDraggable, NAVBAR_HEIGHT, FOOTER_HEIGHT } from '../hooks/useDraggable';

// Panel dimensions
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 420;
const COLLAPSED_SIZE = 64;

const Chat = () => {
  const { user, token } = useAuth();
  const { t, language } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [muteError, setMuteError] = useState(null);
  const scrollRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const wasDraggingRef = useRef(false);

  // Default position: bottom-right, offset from LiveWinFeed
  const getDefaultPosition = useCallback(() => {
    const panelWidth = isExpanded ? PANEL_WIDTH : COLLAPSED_SIZE;
    const panelHeight = isExpanded ? PANEL_HEIGHT : COLLAPSED_SIZE;
    return {
      x: window.innerWidth - panelWidth - 80,
      y: window.innerHeight - FOOTER_HEIGHT - panelHeight - 16
    };
  }, [isExpanded]);

  const { 
    position, 
    setPosition, 
    isDragging, 
    dragRef, 
    handleDragStart,
    constrainPosition
  } = useDraggable(getDefaultPosition());

  // Track if we were dragging to prevent toggle on drag release
  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

  // Reset drag tracking after a short delay
  useEffect(() => {
    if (!isDragging && wasDraggingRef.current) {
      const timer = setTimeout(() => {
        wasDraggingRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  // Initialize position on mount
  useEffect(() => {
    const initialPos = getDefaultPosition();
    setPosition(initialPos);
  }, []);

  // Adjust position when expanding/collapsing to keep panel in bounds
  useEffect(() => {
    if (position.x !== null && position.y !== null && dragRef.current) {
      const width = isExpanded ? PANEL_WIDTH : COLLAPSED_SIZE;
      const height = isExpanded ? PANEL_HEIGHT : COLLAPSED_SIZE;
      
      let newX = position.x;
      let newY = position.y;
      
      if (isExpanded && position.x + width > window.innerWidth - 8) {
        newX = window.innerWidth - width - 8;
      }
      if (isExpanded && position.y + height > window.innerHeight - FOOTER_HEIGHT - 8) {
        newY = window.innerHeight - FOOTER_HEIGHT - height - 8;
      }
      
      const constrained = constrainPosition(newX, newY, width, height);
      if (constrained.x !== position.x || constrained.y !== position.y) {
        setPosition(constrained);
      }
    }
  }, [isExpanded]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isExpanded]);

  // Track unread messages when collapsed
  useEffect(() => {
    if (!isExpanded && messages.length > lastMessageCountRef.current) {
      setUnreadCount(prev => prev + (messages.length - lastMessageCountRef.current));
    }
    lastMessageCountRef.current = messages.length;
  }, [messages, isExpanded]);

  // Clear unread when expanded
  useEffect(() => {
    if (isExpanded) {
      setUnreadCount(0);
    }
  }, [isExpanded]);

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/chat/messages?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      // Silently fail
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || loading) return;

    setLoading(true);
    setMuteError(null);
    try {
      const response = await fetch(`/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ message: newMessage.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, data]);
        setNewMessage('');
      } else if (response.status === 403) {
        // User is muted - show error message
        const errorData = await response.json();
        setMuteError(errorData.detail || 'You are muted.');
        // Clear error after 5 seconds
        setTimeout(() => setMuteError(null), 5000);
      }
    } catch (error) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const getBadgeIcon = (badge) => {
    const badges = {
      vip: '👑',
      supporter: '❤️',
      veteran: '⭐',
      whale: '💎'
    };
    return badges[badge] || '';
  };

  // Handle toggle - only if not dragging
  const handleToggle = (e) => {
    e.stopPropagation();
    if (!wasDraggingRef.current && !isDragging) {
      setIsExpanded(!isExpanded);
    }
  };

  // Collapsed button/indicator
  if (!isExpanded) {
    return (
      <div
        ref={dragRef}
        data-testid="chat-collapsed"
        className="fixed z-40 select-none"
        style={{
          left: position.x !== null ? `${position.x}px` : 'auto',
          top: position.y !== null ? `${position.y}px` : 'auto',
          right: position.x === null ? '80px' : 'auto',
          bottom: position.y === null ? `${FOOTER_HEIGHT + 16}px` : 'auto'
        }}
      >
        <div className="flex flex-col items-center">
          {/* DRAG HANDLE - Separate area above button */}
          <div 
            className={`w-full flex items-center justify-center py-1.5 px-2 bg-primary/80 rounded-t-lg ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            data-testid="chat-drag-handle"
          >
            <GripVertical className="w-4 h-4 text-black/60" />
          </div>
          
          {/* TOGGLE BUTTON - Main button for expanding */}
          <button
            onClick={handleToggle}
            className="relative w-14 h-14 rounded-b-full rounded-t-none bg-primary hover:bg-primary/90 shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105"
            data-testid="chat-expand-btn"
          >
            <MessageCircle className="h-6 w-6 text-black" />
            
            {/* Unread Badge */}
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Expanded floating panel
  return (
    <div
      ref={dragRef}
      data-testid="chat-panel"
      className="fixed z-40 select-none"
      style={{
        left: position.x !== null ? `${position.x}px` : 'auto',
        top: position.y !== null ? `${position.y}px` : 'auto',
        right: position.x === null ? '80px' : 'auto',
        bottom: position.y === null ? `${FOOTER_HEIGHT + 16}px` : 'auto',
        width: `${PANEL_WIDTH}px`,
        height: `${PANEL_HEIGHT}px`
      }}
    >
      <div className="h-full bg-[#0A0A0C]/98 backdrop-blur-md border border-primary/30 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with SEPARATE drag handle and collapse button */}
        <div className="flex items-center justify-between border-b border-white/10 bg-black/50">
          {/* DRAG HANDLE - Left side, clearly separated */}
          <div 
            className={`flex items-center gap-1 px-3 py-2.5 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} hover:bg-white/5 transition-colors rounded-tl-xl`}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            data-testid="chat-drag-handle"
          >
            <GripVertical className="w-5 h-5 text-white/50" />
            <div className="w-px h-6 bg-white/10 ml-1" />
          </div>
          
          {/* Title - Middle (not interactive) */}
          <div className="flex items-center gap-2 flex-1 px-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="font-semibold text-white text-sm">{t('chat')}</span>
            <Badge variant="outline" className="text-[10px] border-primary/50 text-primary px-1.5">
              {messages.length}
            </Badge>
          </div>
          
          {/* COLLAPSE BUTTON - Right side, clearly separated */}
          <button
            onClick={handleToggle}
            className="p-2.5 hover:bg-white/10 transition-colors rounded-tr-xl"
            data-testid="chat-collapse-btn"
          >
            <Minimize2 className="w-4 h-4 text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-3" ref={scrollRef}>
          <div className="space-y-2.5">
            {messages.length === 0 ? (
              <div className="text-center text-white/40 py-8">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {language === 'de' ? 'Keine Nachrichten' : 'No messages yet'}
                </p>
              </div>
            ) : (
              messages.slice(-30).map((msg) => (
                <div 
                  key={msg.message_id} 
                  className={`animate-fade-in ${
                    msg.user_id === user?.user_id ? 'ml-3' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                        {msg.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {msg.active_tag && (
                          <span className="text-xs">{msg.active_tag}</span>
                        )}
                        <span 
                          className="font-medium text-xs truncate max-w-[100px]"
                          style={{ color: msg.active_name_color || msg.name_color || '#EDEDED' }}
                        >
                          {msg.username}
                        </span>
                        {msg.badge && (
                          <span className="text-[10px]">{getBadgeIcon(msg.badge)}</span>
                        )}
                        <span className="text-[10px] text-white/30">
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-white/80 break-words mt-0.5">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-2 border-t border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={language === 'de' ? 'Nachricht...' : 'Message...'}
              maxLength={500}
              className="flex-1 h-8 text-sm bg-black/50 border-white/10 text-white placeholder:text-white/30"
              data-testid="chat-input"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={loading || !newMessage.trim()}
              className="h-8 w-8 bg-primary hover:bg-primary/90 text-black"
              data-testid="chat-send-btn"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
