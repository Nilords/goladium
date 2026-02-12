import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { 
  Zap, 
  Gamepad2,
  Trophy,
  Coins,
  TrendingUp,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Minimize2
} from 'lucide-react';
import { useDraggable, NAVBAR_HEIGHT, FOOTER_HEIGHT } from '../hooks/useDraggable';

// Panel dimensions
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 380;
const COLLAPSED_WIDTH = 56;
const COLLAPSED_HEIGHT = 160;

const LiveWinFeed = () => {
  const { language } = useLanguage();
  const [wins, setWins] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef(null);
  const wasDraggingRef = useRef(false);
  
  // Default position: right side, centered vertically in available space
  const getDefaultPosition = useCallback(() => {
    const availableHeight = window.innerHeight - NAVBAR_HEIGHT - FOOTER_HEIGHT;
    const panelHeight = isExpanded ? PANEL_HEIGHT : COLLAPSED_HEIGHT;
    const panelWidth = isExpanded ? PANEL_WIDTH : COLLAPSED_WIDTH;
    return {
      x: window.innerWidth - panelWidth - 16,
      y: NAVBAR_HEIGHT + (availableHeight - panelHeight) / 2
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
      const width = isExpanded ? PANEL_WIDTH : COLLAPSED_WIDTH;
      const height = isExpanded ? PANEL_HEIGHT : COLLAPSED_HEIGHT;
      
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
    loadLiveWins();
    intervalRef.current = setInterval(loadLiveWins, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadLiveWins = async () => {
    try {
      const response = await fetch(`/api/live-wins?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setWins(data);
      }
    } catch (error) {
      // Silently fail
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'de' ? 'jetzt' : 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  const formatAmount = (amount) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toFixed(0);
  };

  // Handle toggle - only if not dragging
  const handleToggle = (e) => {
    e.stopPropagation();
    if (!wasDraggingRef.current && !isDragging) {
      setIsExpanded(!isExpanded);
    }
  };

  const latestWin = wins[0];

  // Collapsed indicator handle
  if (!isExpanded) {
    return (
      <div
        ref={dragRef}
        data-testid="live-wins-collapsed"
        className="fixed z-40 select-none"
        style={{
          left: position.x !== null ? `${position.x}px` : 'auto',
          top: position.y !== null ? `${position.y}px` : 'auto',
          right: position.x === null ? '16px' : 'auto',
          bottom: position.y === null ? `${FOOTER_HEIGHT + 100}px` : 'auto',
          width: `${COLLAPSED_WIDTH}px`
        }}
      >
        <div className="bg-[#0A0A0C]/95 backdrop-blur-md border border-green-500/40 rounded-xl shadow-lg overflow-hidden">
          {/* DRAG HANDLE - Separate area only for dragging */}
          <div 
            className={`flex items-center justify-center py-2.5 bg-green-500/30 border-b border-green-500/30 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            data-testid="live-wins-drag-handle"
          >
            <GripVertical className="w-5 h-5 text-green-400" />
          </div>
          
          {/* Content - NOT draggable */}
          <div className="flex flex-col items-center py-3 px-1 gap-2">
            <Zap className="w-5 h-5 text-green-400 animate-pulse" />
            
            {wins.length > 0 && (
              <>
                <span className="text-green-400 font-bold text-sm">
                  {wins.length}
                </span>
                {latestWin && (
                  <span className="text-green-400/70 text-[10px] font-medium">
                    +{formatAmount(latestWin.win_amount)}G
                  </span>
                )}
              </>
            )}
            
            <span className="text-white/40 text-[9px] font-medium writing-mode-vertical transform -rotate-180" style={{ writingMode: 'vertical-rl' }}>
              {language === 'de' ? 'LIVE' : 'LIVE'}
            </span>
          </div>
          
          {/* TOGGLE BUTTON - Separate area only for expanding */}
          <button
            onClick={handleToggle}
            className="w-full py-2 bg-green-500/20 hover:bg-green-500/30 border-t border-green-500/30 flex items-center justify-center transition-colors"
            data-testid="live-wins-expand-btn"
          >
            <ChevronUp className="w-4 h-4 text-green-400" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded floating panel
  return (
    <div
      ref={dragRef}
      data-testid="live-wins-panel"
      className="fixed z-40 select-none"
      style={{
        left: position.x !== null ? `${position.x}px` : 'auto',
        top: position.y !== null ? `${position.y}px` : 'auto',
        right: position.x === null ? '16px' : 'auto',
        bottom: position.y === null ? `${FOOTER_HEIGHT + 100}px` : 'auto',
        width: `${PANEL_WIDTH}px`,
        height: `${PANEL_HEIGHT}px`
      }}
    >
      <div className="h-full bg-[#0A0A0C]/98 backdrop-blur-md border border-green-500/30 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header with SEPARATE drag handle and collapse button */}
        <div className="flex items-center justify-between bg-gradient-to-r from-green-500/20 to-green-600/20 border-b border-green-500/20">
          {/* DRAG HANDLE - Left side, clearly separated */}
          <div 
            className={`flex items-center gap-1 px-3 py-2.5 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} hover:bg-white/5 transition-colors rounded-l-xl`}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            data-testid="live-wins-drag-handle"
          >
            <GripVertical className="w-5 h-5 text-white/50" />
            <div className="w-px h-6 bg-white/10 ml-1" />
          </div>
          
          {/* Title - Middle (not interactive) */}
          <div className="flex items-center gap-2 flex-1 px-2">
            <Zap className="w-4 h-4 text-green-400 animate-pulse" />
            <span className="text-white font-semibold text-sm">
              {language === 'de' ? 'Live Gewinne' : 'Live Wins'}
            </span>
            <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px] px-1.5">
              {wins.length}
            </Badge>
          </div>
          
          {/* COLLAPSE BUTTON - Right side, clearly separated */}
          <button
            onClick={handleToggle}
            className="p-2.5 hover:bg-white/10 transition-colors rounded-r-xl"
            data-testid="live-wins-collapse-btn"
          >
            <Minimize2 className="w-4 h-4 text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {wins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-4">
              <Zap className="w-8 h-8 text-white/20 mb-2" />
              <p className="text-white/40 text-sm">
                {language === 'de' ? 'Noch keine großen Gewinne' : 'No big wins yet'}
              </p>
              <p className="text-white/30 text-xs mt-1">
                {language === 'de' ? 'Gewinne über 10 G' : 'Wins over 10 G'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {wins.slice(0, 10).map((win, index) => (
                <div 
                  key={win.win_id || index}
                  data-testid={`live-win-entry-${index}`}
                  className={`p-2.5 hover:bg-white/5 transition-colors ${
                    index === 0 ? 'bg-green-500/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`p-1 rounded-lg shrink-0 ${
                      win.game_type === 'slot' ? 'bg-primary/20' : 'bg-purple-500/20'
                    }`}>
                      {win.game_type === 'slot' ? (
                        <Gamepad2 className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Trophy className="w-3.5 h-3.5 text-purple-400" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white font-medium text-xs truncate">
                          {win.username}
                        </span>
                        <span className="text-white/40 text-[10px] shrink-0">
                          {formatTimeAgo(win.timestamp)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-green-400 font-bold text-sm" data-testid={`win-amount-${index}`}>
                          +{formatAmount(win.win_amount)} G
                        </span>
                        {win.multiplier > 0 && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-0 text-[10px] px-1 py-0">
                            {win.multiplier}x
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 mt-0.5">
                        <Coins className="w-2.5 h-2.5 text-white/40" />
                        <span className="text-white/50 text-[10px]">
                          {language === 'de' ? 'Einsatz:' : 'Wager:'}
                        </span>
                        <span className="text-white/70 text-[10px] font-medium">
                          {formatAmount(win.bet_amount)} G
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-green-500/20 bg-black/30">
          <p className="text-white/30 text-[10px] text-center">
            {language === 'de' ? 'Aktualisiert alle 5s' : 'Updates every 5s'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveWinFeed;
