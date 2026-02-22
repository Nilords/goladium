import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { 
  Users, 
  Clock, 
  Trophy, 
  Zap,
  AlertCircle,
  Crown
} from 'lucide-react';



// ============ JACKPOT PATTERN SYSTEM ============

// Default colors available to all players (free)
const DEFAULT_PATTERNS = {
  'default_lightblue': { background: '#38BDF8', type: 'solid' },   // Light Blue
  'default_pink': { background: '#F472B6', type: 'solid' },        // Pink
  'default_red': { background: '#EF4444', type: 'solid' },         // Red
  'default_orange': { background: '#F97316', type: 'solid' },      // Orange
  'default_yellow': { background: '#FACC15', type: 'solid' },      // Yellow
};

// Premium patterns (unlocked via shop) - must match backend PRESTIGE_COSMETICS
const PREMIUM_PATTERNS = {
  'pattern_flames': { 
    background: 'linear-gradient(180deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)', 
    type: 'gradient' 
  },
  'pattern_northern_lights': { 
    background: 'linear-gradient(135deg, #00FF87 0%, #60EFFF 50%, #B967FF 100%)', 
    type: 'gradient' 
  },
  'pattern_void': { 
    background: 'linear-gradient(180deg, #0D0221 0%, #3D1A78 30%, #6B21A8 60%, #F472B6 100%)', 
    type: 'gradient' 
  },
};

// All patterns combined
const ALL_PATTERNS = { ...DEFAULT_PATTERNS, ...PREMIUM_PATTERNS };

// Default pattern assignment based on user_id (for players without custom selection)
const DEFAULT_PATTERN_KEYS = Object.keys(DEFAULT_PATTERNS);

/**
 * Resolve jackpot tile style for a participant
 * @param {object} participant - Participant data with optional jackpot_pattern
 * @returns {object} Style config { background, type }
 */
const resolveJackpotPattern = (participant) => {
  // If player has a custom pattern selected, use it
  if (participant.jackpot_pattern && ALL_PATTERNS[participant.jackpot_pattern]) {
    return ALL_PATTERNS[participant.jackpot_pattern];
  }
  
  // Otherwise, assign a default color based on user_id hash
  if (participant.user_id) {
    let hash = 0;
    for (let i = 0; i < participant.user_id.length; i++) {
      hash = ((hash << 5) - hash) + participant.user_id.charCodeAt(i);
      hash = hash & hash;
    }
    const patternKey = DEFAULT_PATTERN_KEYS[Math.abs(hash) % DEFAULT_PATTERN_KEYS.length];
    return DEFAULT_PATTERNS[patternKey];
  }
  
  // Fallback
  return DEFAULT_PATTERNS['default_lightblue'];
};

// ============ PURE FUNCTIONS (outside component for performance) ============

// Deterministic shuffle using Fisher-Yates with seeded LCG
const deterministicShuffle = (array, seed) => {
  const shuffled = [...array];
  let currentSeed = Math.abs(seed) || 1;
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    const j = Math.floor((currentSeed / 0x7fffffff) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
};

// Generate a deterministic seed from string
const stringToSeed = (str) => {
  if (!str) return 1;
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = ((seed << 5) - seed) + str.charCodeAt(i);
    seed = seed & seed;
  }
  return Math.abs(seed) || 1;
};

// Core function to generate weighted, shuffled spin cards
const buildSpinCards = (participants, jackpotId) => {
  if (!participants || participants.length === 0) return [];
  
  const totalPot = participants.reduce((sum, p) => sum + p.bet_amount, 0);
  if (totalPot === 0) return [];
  
  const TOTAL_TILES = 100;
  
  const participantTiles = participants.map((p, idx) => {
    const winChance = p.bet_amount / totalPot;
    const tileCount = Math.max(1, Math.round(winChance * TOTAL_TILES));
    // Resolve pattern from player customization
    const patternStyle = resolveJackpotPattern(p);
    return {
      participant: p,
      patternStyle, // { background, type }
      originalIndex: idx,
      count: tileCount
    };
  });
  
  const tiles = [];
  participantTiles.forEach(({ participant, patternStyle, originalIndex, count }) => {
    for (let i = 0; i < count; i++) {
      tiles.push({ ...participant, patternStyle, originalIndex });
    }
  });
  
  const seedString = jackpotId || participants.map(p => `${p.user_id}:${p.bet_amount}`).join('-');
  const seed = stringToSeed(seedString);
  const shuffledTiles = deterministicShuffle(tiles, seed);
  
  return shuffledTiles.map((tile, idx) => ({ ...tile, key: `card-${idx}` }));
};

// Generate cache key for participants (only rebuild if users/bets change)
const getParticipantsCacheKey = (participants) => {
  if (!participants || participants.length === 0) return '';
  return participants.map(p => `${p.user_id}:${p.bet_amount}`).join('|');
};

// ============ COMPONENT ============

const Jackpot = () => {
  const { user, token, updateUserBalance, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  
  const [jackpotStatus, setJackpotStatus] = useState({
    state: 'idle',
    total_pot: 0,
    participants: [],
    countdown_seconds: null,
    winner: null,
    winner_index: null,
    jackpot_id: null,
    max_participants: 50,
    is_full: false
  });
  const [betAmount, setBetAmount] = useState(1.00);
  const [joining, setJoining] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [displayOffset, setDisplayOffset] = useState(0); // Visual offset with modulo applied
  const [showWinner, setShowWinner] = useState(false);
  const [animationWinner, setAnimationWinner] = useState(null);
  const [animationPot, setAnimationPot] = useState(0);
  const [animationParticipants, setAnimationParticipants] = useState([]);
  const spinContainerRef = useRef(null);
  const previousStateRef = useRef('idle');
  const animationRef = useRef(null); // For requestAnimationFrame

  useEffect(() => {
    // Don't poll during spinning animation
    if (isSpinning || showWinner) return;
    
    loadJackpotStatus();
    const interval = setInterval(() => {
      if (!isSpinning && !showWinner) {
        loadJackpotStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isSpinning, showWinner]);

  // Detect state change to 'complete' and trigger animation
  useEffect(() => {
    if (previousStateRef.current !== 'complete' && jackpotStatus.state === 'complete' && jackpotStatus.winner && jackpotStatus.winner_index !== null) {
      // Backend winner is the ONLY source of truth for winner display
      // The wheel animation is purely visual - it does not determine the winner
      setAnimationWinner(jackpotStatus.winner);
      setAnimationPot(jackpotStatus.total_pot);
      
      // Freeze participants FIRST, then pass to animation
      const frozenParticipants = [...jackpotStatus.participants];
      setAnimationParticipants(frozenParticipants);
      
      // Pass frozen participants directly to ensure consistency
      startSpinAnimation(jackpotStatus.winner_index, frozenParticipants, jackpotStatus.jackpot_id);
    }
    previousStateRef.current = jackpotStatus.state;
  }, [jackpotStatus.state, jackpotStatus.winner, jackpotStatus.winner_index]);

  const loadJackpotStatus = async () => {
    try {
      const response = await fetch(`/api/games/jackpot/status`);
      if (response.ok) {
        const data = await response.json();
        setJackpotStatus(data);
      }
    } catch (error) {
      console.error('Failed to load jackpot status:', error);
    }
  };

  // Server-authoritative spin animation
  // serverWinnerIndex refers to the participant's position in the original list
  // frozenParticipants and frozenJackpotId are passed directly to ensure consistency with rendering
  const startSpinAnimation = (serverWinnerIndex, frozenParticipants, frozenJackpotId) => {
    if (serverWinnerIndex === null || serverWinnerIndex === undefined || !frozenParticipants || frozenParticipants.length === 0) return;
    
    // FIXED CARD DIMENSIONS - must match CSS exactly
    const cardWidth = 120;
    const cardMargin = 4;
    const cardTotalWidth = cardWidth + (cardMargin * 2); // 128px per card
    
    // Generate cards using the SAME frozen data that will be used for rendering
    // This ensures animation target matches the rendered tiles exactly
    const cards = buildSpinCards(frozenParticipants, frozenJackpotId);
    
    if (cards.length === 0) {
      console.error('[Jackpot] No cards generated');
      return;
    }
    
    // Find all positions where the winner appears in the shuffled tile list
    const winnerPositions = [];
    cards.forEach((card, idx) => {
      if (card.originalIndex === serverWinnerIndex) {
        winnerPositions.push(idx);
      }
    });
    
    if (winnerPositions.length === 0) {
      console.error('[Jackpot] Winner not found in tile list');
      return;
    }
    
    // Minimum spin distance for dramatic effect
    // With fewer tiles, extra rotations are added automatically below
    const minSpinDistance = cardTotalWidth * 300;
    
    // Find a winner position that's far enough into the list
    const minIndex = Math.ceil(minSpinDistance / cardTotalWidth);
    const validPositions = winnerPositions.filter(pos => pos >= minIndex);
    
    // Use first valid position, or last position with extra rotations
    let targetPosition;
    if (validPositions.length > 0) {
      targetPosition = validPositions[0];
    } else {
      targetPosition = winnerPositions[winnerPositions.length - 1];
    }
    
    // Get container width for centering calculation
    const containerWidth = spinContainerRef.current?.offsetWidth || 800;
    
    // Calculate final offset to land on the target tile, centered under marker
    // targetPosition * cardTotalWidth = left edge of tile
    // + cardMargin = account for margin
    // - containerWidth/2 = shift so center of viewport aligns
    // + cardTotalWidth/2 = center of tile (not left edge)
    const targetOffset = (targetPosition * cardTotalWidth) + cardMargin - (containerWidth / 2) + (cardTotalWidth / 2);
    
    // Ensure minimum spin distance
    let finalOffset = targetOffset;
    if (finalOffset < minSpinDistance) {
      const fullListWidth = cards.length * cardTotalWidth;
      const extraRotations = Math.ceil((minSpinDistance - finalOffset) / fullListWidth);
      finalOffset += extraRotations * fullListWidth;
    }
    
    // Total width of all tiles
    const totalWidth = cards.length * cardTotalWidth;
    
    // Calculate safety buffer based on viewport
    const visibleTiles = Math.ceil(containerWidth / cardTotalWidth);
    const bufferTiles = visibleTiles + 2;
    const bufferPx = bufferTiles * cardTotalWidth;
    
    // Safe loop window - viewport never reaches list edges
    const loopWidth = totalWidth - (bufferPx * 2);
    
    // Base offset for centered start
    const baseOffset = loopWidth / 2;
    
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Start with safe offset
    setDisplayOffset(bufferPx + baseOffset);
    setIsSpinning(true);
    setShowWinner(false);
    
    // Easing function
    const easeOut = (t) => {
      return 1 - Math.pow(1 - t, 4);
    };
    
    // Animation parameters
    const duration = 10000;
    const startTime = performance.now();
    
    // Animation loop with safe modulo window
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);
      
      const currentOffset = easedProgress * finalOffset;
      
      // Safe loop window: always inside bufferPx margins
      const visualOffset = bufferPx + ((baseOffset + currentOffset) % loopWidth);
      setDisplayOffset(visualOffset);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        setIsSpinning(false);
        setShowWinner(true);
        refreshUser();
        
        setTimeout(() => {
          setShowWinner(false);
          setAnimationWinner(null);
          setAnimationPot(0);
          setAnimationParticipants([]);
          loadJackpotStatus();
        }, 8000);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  };

  const joinJackpot = async () => {
    if (joining) return;
    if (betAmount > (user?.balance || 0)) {
      toast.error(t('insufficient_balance'));
      return;
    }

    setJoining(true);
    try {
      const response = await fetch(`/api/games/jackpot/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ bet_amount: betAmount })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to join');
      }

      toast.success(language === 'de' ? 'Beigetreten!' : 'Joined!');
      await refreshUser();
      await loadJackpotStatus();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setJoining(false);
    }
  };

  const isUserInJackpot = jackpotStatus.participants.some(p => p.user_id === user?.user_id);

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStateMessage = () => {
    switch (jackpotStatus.state) {
      case 'idle':
        return language === 'de' ? 'Warte auf Spieler...' : 'Waiting for players...';
      case 'waiting':
        return language === 'de' ? 'Warte auf zweiten Spieler...' : 'Waiting for second player...';
      case 'active':
        return language === 'de' ? 'Jackpot aktiv!' : 'Jackpot active!';
      case 'spinning':
        return language === 'de' ? 'Rad dreht sich...' : 'Wheel spinning...';
      case 'complete':
        return language === 'de' ? 'Gewinner ermittelt!' : 'Winner determined!';
      default:
        return '';
    }
  };

  const getStateColor = () => {
    switch (jackpotStatus.state) {
      case 'idle': return 'bg-white/10 text-white/60';
      case 'waiting': return 'bg-yellow-500/20 text-yellow-400';
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'spinning': return 'bg-purple-500/20 text-purple-400';
      case 'complete': return 'bg-gold/20 text-gold';
      default: return 'bg-white/10 text-white/60';
    }
  };

  // Cache key for participants - only changes when users/bets actually change
  const participantsCacheKey = useMemo(() => 
    getParticipantsCacheKey(jackpotStatus.participants), 
    [jackpotStatus.participants]
  );

  // MEMOIZED: Base cards from current jackpot (only recompute when participant data changes)
  const baseSpinCards = useMemo(() => {
    return buildSpinCards(jackpotStatus.participants, jackpotStatus.jackpot_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsCacheKey, jackpotStatus.jackpot_id]);

  // Cache key for frozen animation participants
  const frozenCacheKey = useMemo(() => 
    getParticipantsCacheKey(animationParticipants), 
    [animationParticipants]
  );

  // MEMOIZED: Animation cards frozen at start of spin
  const frozenSpinCards = useMemo(() => {
    if (animationParticipants.length > 0) {
      return buildSpinCards(animationParticipants, jackpotStatus.jackpot_id);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenCacheKey, jackpotStatus.jackpot_id]);

  // Use frozen cards during animation, otherwise use base cards
  const spinCards = (isSpinning || showWinner) && frozenSpinCards ? frozenSpinCards : baseSpinCards;

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full">
        <div className="text-center mb-6 sm:mb-8 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
            {t('jackpot') || 'Jackpot'}
          </h1>
          <p className="text-white/50 text-sm sm:text-base">
            {language === 'de' 
              ? 'Spieler vs. Spieler - Gewinnchance proportional zum Einsatz!'
              : 'Player vs Player - Win chance proportional to bet!'}
          </p>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
          {/* Main Jackpot Area */}
          <div className="flex-1 min-w-0">
            <Card className="bg-[#0A0A0C] border-white/5 overflow-hidden">
              <CardHeader className="border-b border-white/5 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-gold" />
                    {language === 'de' ? 'Aktueller Jackpot' : 'Current Jackpot'}
                  </CardTitle>
                  <Badge className={`${getStateColor()} border-0 text-xs sm:text-sm w-fit`}>
                    {getStateMessage()}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {/* Pot Display */}
                <div className="text-center mb-4 sm:mb-6">
                  <p className="text-white/50 text-xs sm:text-sm mb-1 sm:mb-2">
                    {language === 'de' ? 'Gesamter Pot' : 'Total Pot'}
                  </p>
                  <div className="text-3xl sm:text-5xl lg:text-6xl font-bold font-mono text-gold animate-gold-pulse">
                    {jackpotStatus.total_pot.toFixed(2)}
                    <span className="text-lg sm:text-2xl text-gold/60 ml-1 sm:ml-2">G</span>
                  </div>
                  <p className="text-white/40 text-xs sm:text-sm mt-1 sm:mt-2">
                    {jackpotStatus.participants.length}/{jackpotStatus.max_participants} {language === 'de' ? 'Spieler' : 'players'}
                  </p>
                </div>

                {/* Horizontal Spin Wheel */}
                <div className="relative mb-6 sm:mb-8">
                  {/* Center indicator line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 sm:w-1 bg-gold z-20 transform -translate-x-1/2 shadow-[0_0_20px_rgba(255,215,0,0.8)]">
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-gold sm:border-l-[10px] sm:border-r-[10px] sm:border-t-[16px]" />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-gold sm:border-l-[10px] sm:border-r-[10px] sm:border-b-[16px]" />
                  </div>

                  {/* Spin container */}
                  <div 
                    className="relative overflow-hidden rounded-lg sm:rounded-xl bg-[#111] border border-white/10 sm:border-2 h-[120px] sm:h-[160px] lg:h-[180px]"
                    ref={spinContainerRef}
                  >
                    {/* Gradient overlays for fade effect */}
                    <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-12 lg:w-20 bg-gradient-to-r from-[#111] to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-12 lg:w-20 bg-gradient-to-l from-[#111] to-transparent z-10 pointer-events-none" />

                    {jackpotStatus.participants.length > 0 ? (
                      <div 
                        className="flex items-center h-full"
                        style={{
                          // JS-driven animation - centering handled mathematically
                          transform: `translateX(-${displayOffset}px)`
                        }}
                      >
                        {/* Only 100 tiles rendered - safe loop window prevents edge flicker */}
                        {spinCards.map((card, idx) => (
                          <div
                            key={card.key}
                            className="flex-shrink-0 rounded-md sm:rounded-lg overflow-hidden flex flex-col items-center justify-center"
                            style={{ 
                              // Use resolved pattern style (solid color or gradient)
                              background: card.patternStyle?.background || '#38BDF8',
                              width: '120px',
                              height: '140px',
                              margin: '0 4px'
                            }}
                          >
                            {/* Lightweight tiles during animation, full tiles otherwise */}
                            {isSpinning ? (
                              // LIGHTWEIGHT: Pattern + username only during spin
                              <>
                                <div 
                                  className="w-14 h-14 rounded-full mb-2 flex items-center justify-center text-2xl font-bold text-white"
                                  style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
                                >
                                  {card.username?.charAt(0).toUpperCase()}
                                </div>
                                <p className="text-white font-bold text-xs truncate max-w-[110px] px-1 text-center">
                                  {card.username}
                                </p>
                              </>
                            ) : (
                              // FULL: Avatar + name + win chance when not spinning
                              <>
                                <Avatar className="w-14 h-14 border-4 border-white/30 mb-2">
                                  <AvatarImage src={card.avatar} />
                                  <AvatarFallback 
                                    className="text-xl font-bold text-white"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
                                  >
                                    {card.username?.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="text-white font-bold text-xs truncate max-w-[110px] px-1 text-center drop-shadow-lg">
                                  {card.username}
                                </p>
                                <p className="text-white/80 text-[11px] font-mono mt-0.5">
                                  {card.win_chance?.toFixed(1)}%
                                </p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Users className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-white/20 mx-auto mb-2" />
                          <p className="text-white/40 text-xs sm:text-sm lg:text-base">
                            {language === 'de' ? 'Warte auf Spieler...' : 'Waiting for players...'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Winner Display - Prominent celebration */}
                {showWinner && animationWinner && (
                  <div className="text-center mb-4 sm:mb-6">
                    <div className="inline-block animate-bounce">
                      <div className="relative px-6 sm:px-10 py-4 sm:py-6 rounded-2xl bg-gradient-to-r from-gold/30 via-yellow-500/30 to-gold/30 border-2 border-gold shadow-[0_0_40px_rgba(255,215,0,0.5)]">
                        {/* Sparkle effects */}
                        <div className="absolute -top-2 -left-2 w-4 h-4 bg-gold rounded-full animate-ping opacity-75"></div>
                        <div className="absolute -top-2 -right-2 w-4 h-4 bg-gold rounded-full animate-ping opacity-75" style={{animationDelay: '0.2s'}}></div>
                        <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-gold rounded-full animate-ping opacity-75" style={{animationDelay: '0.4s'}}></div>
                        <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-gold rounded-full animate-ping opacity-75" style={{animationDelay: '0.6s'}}></div>
                        
                        <div className="flex items-center justify-center gap-3 sm:gap-4">
                          <Crown className="w-8 h-8 sm:w-12 sm:h-12 text-gold animate-pulse" />
                          <div className="text-left">
                            <p className="text-gold font-bold text-xl sm:text-3xl">{animationWinner.username}</p>
                            <p className="text-gold/80 text-sm sm:text-lg font-semibold">
                              {language === 'de' ? '🎉 GEWINNER! 🎉' : '🎉 WINNER! 🎉'}
                            </p>
                            <p className="text-green-400 text-lg sm:text-2xl font-mono font-bold mt-1">
                              +{animationPot.toFixed(2)} G
                            </p>
                          </div>
                          <Crown className="w-8 h-8 sm:w-12 sm:h-12 text-gold animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Countdown */}
                {jackpotStatus.countdown_seconds !== null && jackpotStatus.countdown_seconds > 0 && !isSpinning && (
                  <div className="text-center mb-4 sm:mb-6">
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-white/10">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      <span className="text-xl sm:text-2xl font-mono text-white">
                        {formatTime(jackpotStatus.countdown_seconds)}
                      </span>
                    </div>
                    <Progress 
                      value={jackpotStatus.state === 'waiting' 
                        ? ((600 - jackpotStatus.countdown_seconds) / 600) * 100
                        : ((30 - jackpotStatus.countdown_seconds) / 30) * 100
                      } 
                      className="mt-2 h-1 max-w-[200px] sm:max-w-xs mx-auto"
                    />
                  </div>
                )}

                {/* Join Controls */}
                {!isUserInJackpot && jackpotStatus.state !== 'spinning' && jackpotStatus.state !== 'complete' && !isSpinning && (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-center gap-2 sm:gap-4">
                      <span className="text-white/60 text-sm sm:text-base">{t('bet')}:</span>
                      <Input
                        type="number"
                        value={betAmount}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setBetAmount(val);
                          } else if (e.target.value === '' || e.target.value === '0') {
                            setBetAmount('');
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val) || val < 0.01) {
                            setBetAmount(0.01);
                          }
                        }}
                        step={0.1}
                        min={0.01}
                        placeholder="Einsatz"
                        className="w-24 sm:w-32 text-center text-lg sm:text-xl font-mono font-bold text-white bg-black/50 border-white/20"
                        data-testid="jackpot-bet-input"
                        disabled={jackpotStatus.is_full}
                      />
                      <span className="text-white/60 font-bold text-sm sm:text-base">G</span>
                    </div>

                    {/* Jackpot Full Warning */}
                    {jackpotStatus.is_full && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {language === 'de' 
                            ? `Jackpot voll (${jackpotStatus.max_participants} Spieler). Bitte warte auf die nächste Runde.`
                            : `Jackpot full (${jackpotStatus.max_participants} players). Please wait for next round.`}
                        </span>
                      </div>
                    )}

                    <Button
                      onClick={joinJackpot}
                      disabled={joining || betAmount > (user?.balance || 0) || jackpotStatus.is_full}
                      className="w-full h-12 sm:h-14 text-base sm:text-lg font-bold uppercase bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="join-jackpot-btn"
                    >
                      {joining ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>{language === 'de' ? 'Beitritt...' : 'Joining...'}</span>
                        </div>
                      ) : jackpotStatus.is_full ? (
                        <span>{language === 'de' ? 'Jackpot Voll' : 'Jackpot Full'}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                          <span>{t('join_jackpot') || (language === 'de' ? 'Beitreten' : 'Join Jackpot')}</span>
                        </div>
                      )}
                    </Button>
                  </div>
                )}

                {isUserInJackpot && !isSpinning && jackpotStatus.state !== 'complete' && (
                  <div className="text-center p-3 sm:p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <p className="text-green-400 text-sm sm:text-base">
                      {language === 'de' ? 'Du bist dabei!' : "You're in!"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Panel - Shows as horizontal cards on medium screens */}
          <div className="xl:w-80 flex-shrink-0 space-y-4 sm:space-y-6">
            {/* Balance and Participants in a row on medium screens */}
            <div className="grid grid-cols-2 xl:grid-cols-1 gap-4 sm:gap-6">
              {/* Balance */}
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-4 sm:p-6">
                  <div className="text-center">
                    <p className="text-white/50 text-xs sm:text-sm mb-1">{t('balance')}</p>
                    <p className="text-xl sm:text-2xl font-mono text-white">
                      {formatCurrency(user?.balance)}
                      <span className="text-base sm:text-lg text-white/60 ml-1 sm:ml-2">G</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Participants */}
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                  <CardTitle className="text-base sm:text-lg text-white flex items-center gap-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    {language === 'de' ? 'Teilnehmer' : 'Participants'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                  {jackpotStatus.participants.length === 0 ? (
                    <p className="text-center text-white/40 py-2 sm:py-4 text-sm">
                      {language === 'de' ? 'Noch keine Teilnehmer' : 'No participants yet'}
                    </p>
                  ) : (
                    <div className="space-y-2 sm:space-y-3 max-h-48 overflow-y-auto">
                      {jackpotStatus.participants.map((p, idx) => (
                        <div 
                          key={p.user_id}
                          className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg ${
                            p.user_id === user?.user_id ? 'bg-primary/10' : 'bg-white/5'
                          }`}
                        >
                          <div 
                            className="w-1.5 sm:w-2 h-6 sm:h-8 rounded-full flex-shrink-0"
                            style={{ background: resolveJackpotPattern(p)?.background || '#38BDF8' }}
                          />
                          <Avatar className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                            <AvatarImage src={p.avatar} />
                            <AvatarFallback className="bg-primary/20 text-primary text-[10px] sm:text-xs">
                              {p.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs sm:text-sm font-medium truncate">{p.username}</p>
                            <p className="text-gold font-mono text-[10px] sm:text-xs">{p.bet_amount.toFixed(2)} G</p>
                          </div>
                          <Badge className="bg-white/10 text-white/80 border-0 font-mono text-[10px] sm:text-xs px-1.5 sm:px-2">
                            {p.win_chance.toFixed(1)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Rules - Full width */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-base sm:text-lg text-white flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gold" />
                  {language === 'de' ? 'Regeln' : 'Rules'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-1 sm:space-y-2 text-xs sm:text-sm text-white/60">
                <p>• {language === 'de' ? 'Gewinnchance = Einsatz / Gesamtpot' : 'Win chance = Bet / Total pot'}</p>
                <p>• {language === 'de' ? 'Mindestens 2 Spieler benötigt' : 'Minimum 2 players required'}</p>
                <p>• {language === 'de' ? '10 Min Wartezeit für 2. Spieler' : '10 min wait for 2nd player'}</p>
                <p>• {language === 'de' ? '30 Sek Countdown nach 2. Spieler' : '30 sec countdown after 2nd player'}</p>
                <p>• {language === 'de' ? 'Gewinner erhält gesamten Pot' : 'Winner takes entire pot'}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default Jackpot;
