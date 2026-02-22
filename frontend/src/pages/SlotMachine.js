import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import LiveWinFeed from '../components/LiveWinFeed';
import Chat from '../components/Chat';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Play, 
  Minus,
  Plus,
  ArrowLeft,
  Eye,
  EyeOff,
  BookOpen,
  Sparkles,
  Zap,
  RotateCw,
  Square
} from 'lucide-react';



// Symbol emoji mapping
const SYMBOLS = {
  cherry: { emoji: '🍒', name: 'Cherry' },
  lemon: { emoji: '🍋', name: 'Lemon' },
  orange: { emoji: '🍊', name: 'Orange' },
  bar: { emoji: '📊', name: 'BAR' },
  seven: { emoji: '7️⃣', name: 'Seven' },
  diamond: { emoji: '💎', name: 'Diamond' },
  wild: { emoji: '⭐', name: 'WILD' },
};

// 8 Straight Paylines for 4x4 grid
// 4 Horizontal (rows) + 4 Vertical (columns)
// No diagonals, zigzags, V-shapes, curves, or specials
const PAYLINES_8 = {
  // Horizontal paylines (4 rows, each spanning 4 columns)
  1: [[0,0],[0,1],[0,2],[0,3]],   // Row 0 - Top horizontal
  2: [[1,0],[1,1],[1,2],[1,3]],   // Row 1 - Second horizontal
  3: [[2,0],[2,1],[2,2],[2,3]],   // Row 2 - Third horizontal
  4: [[3,0],[3,1],[3,2],[3,3]],   // Row 3 - Bottom horizontal
  // Vertical paylines (4 columns, each spanning 4 rows)
  5: [[0,0],[1,0],[2,0],[3,0]],   // Column 0 - Leftmost vertical
  6: [[0,1],[1,1],[2,1],[3,1]],   // Column 1 - Second vertical
  7: [[0,2],[1,2],[2,2],[3,2]],   // Column 2 - Third vertical
  8: [[0,3],[1,3],[2,3],[3,3]],   // Column 3 - Rightmost vertical
};

const LINE_COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00',  // Horizontal lines
  '#FF00FF', '#00FFFF', '#FFA500', '#800080',  // Vertical lines
];

// Dynamic bet values - user can freely adjust with +/- buttons
// Starting values and increments scale based on current bet
const MIN_BET = 0.01;
const BET_INCREMENTS = [0.01, 0.05, 0.10, 0.50, 1.00, 5.00, 10.00, 50.00, 100.00];

const SlotMachine = () => {
  const { slotId } = useParams();
  const currentSlotId = slotId || 'classic';
  const { user, updateUserBalance } = useAuth();
  
  const [betPerLine, setBetPerLine] = useState(0.05);
  const [activeLines, setActiveLines] = useState(8);
  const [reels, setReels] = useState(Array(4).fill(null).map(() => Array(4).fill('cherry')));
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [slotInfo, setSlotInfo] = useState(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState(null);
  const [xpGained, setXpGained] = useState(null);
  const [autoSpin, setAutoSpin] = useState(false);
  const autoSpinRef = useRef(false);

  const totalBet = (betPerLine * activeLines).toFixed(2);

  useEffect(() => {
    loadSlotInfo();
  }, [currentSlotId]);

  const loadSlotInfo = async () => {
    try {
      const response = await fetch(`/api/games/slot/${currentSlotId}/info`);
      if (response.ok) {
        const data = await response.json();
        setSlotInfo(data);
      }
    } catch (error) {
      console.error('Failed to load slot info:', error);
    }
  };

  const adjustBetPerLine = (direction) => {
    // Dynamic bet adjustment - scales increment based on current value
    const getIncrement = (value) => {
      if (value >= 100) return 50.00;
      if (value >= 10) return 5.00;
      if (value >= 1) return 0.50;
      if (value >= 0.10) return 0.05;
      return 0.01;
    };
    
    if (direction === 'up') {
      const increment = getIncrement(betPerLine);
      const newBet = Math.round((betPerLine + increment) * 100) / 100;
      // No upper cap - only constrained by balance during spin
      setBetPerLine(newBet);
    } else if (direction === 'down' && betPerLine > MIN_BET) {
      const increment = getIncrement(betPerLine - 0.01);
      const newBet = Math.max(MIN_BET, Math.round((betPerLine - increment) * 100) / 100);
      setBetPerLine(newBet);
    }
  };

  const adjustLines = (direction) => {
    if (direction === 'up' && activeLines < 8) {
      setActiveLines(activeLines + 1);
    } else if (direction === 'down' && activeLines > 1) {
      setActiveLines(activeLines - 1);
    }
  };

  const setMaxBet = () => {
    // Max bet = use all balance across all 8 lines
    const balance = user?.balance || 0;
    setActiveLines(8);
    // Calculate max possible bet per line with full balance and all 8 lines
    const maxBetPerLine = Math.floor((balance / 8) * 100) / 100;
    setBetPerLine(Math.max(MIN_BET, maxBetPerLine));
  };

  const spin = async () => {
    if (spinning) return;
    
    if (!slotInfo) {
      toast.error('Slot not loaded. Please refresh.');
      return;
    }
    
    const authToken = localStorage.getItem('goladium_token');
    if (!authToken && !user) {
      toast.error('Please log in to play.');
      return;
    }
    
    const betTotal = parseFloat(totalBet);
    if (betTotal > (user?.balance || 0)) {
      toast.error('Insufficient balance');
      return;
    }

    setSpinning(true);
    setLastResult(null);
    setXpGained(null);
    setHighlightedLine(null);
    setShowLines(false);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const linesArray = Array.from({ length: activeLines }, (_, i) => i + 1);
      
      const response = await fetch(`/api/games/slot/spin`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          bet_per_line: betPerLine,
          active_lines: linesArray,
          slot_id: currentSlotId
        })
      });

      if (response.ok) {
        const result = await response.json();
        await animateReels(result.reels);
        
        setReels(result.reels);
        setLastResult(result);
        updateUserBalance(result.new_balance);
        
        if (result.xp_gained > 0) {
          setXpGained(result.xp_gained);
          setTimeout(() => setXpGained(null), 3000);
        }

        if (result.is_win) {
          if (result.is_jackpot) {
            toast.success(`🎉 JACKPOT! +${result.win_amount.toFixed(2)} G`);
          } else if (result.win_amount >= betTotal * 5) {
            toast.success(`🔥 BIG WIN! +${result.win_amount.toFixed(2)} G`);
          } else {
            toast.success(`WIN! +${result.win_amount.toFixed(2)} G`);
          }
          setShowLines(true);
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Spin failed');
      }
    } catch (error) {
      toast.error('Connection error');
    } finally {
      setSpinning(false);
    }
  };

  // Auto-spin logic
  const toggleAutoSpin = () => {
    if (autoSpin) {
      // Stop auto-spin
      autoSpinRef.current = false;
      setAutoSpin(false);
    } else {
      // Start auto-spin
      autoSpinRef.current = true;
      setAutoSpin(true);
      runAutoSpin();
    }
  };

  const runAutoSpin = async () => {
    // Check if auto-spin is still active
    if (!autoSpinRef.current) return;
    
    // Check balance before spinning
    const betTotal = parseFloat(totalBet);
    if (betTotal > (user?.balance || 0)) {
      toast.error('Insufficient balance - Auto-spin stopped');
      autoSpinRef.current = false;
      setAutoSpin(false);
      return;
    }
    
    // Perform a spin
    await spin();
    
    // Wait a bit between spins, then continue if still active
    if (autoSpinRef.current) {
      setTimeout(() => {
        runAutoSpin();
      }, 500); // 0.5 second delay between auto-spins
    }
  };

  // Stop auto-spin when component unmounts or user leaves
  useEffect(() => {
    return () => {
      autoSpinRef.current = false;
    };
  }, []);

  // Weighted random symbol selection for realistic animation
  const getWeightedRandomSymbol = () => {
    if (!slotInfo?.symbols || slotInfo.symbols.length === 0) {
      return Object.keys(SYMBOLS)[Math.floor(Math.random() * Object.keys(SYMBOLS).length)];
    }
    
    // Build cumulative probability array
    const totalProb = slotInfo.symbols.reduce((sum, s) => sum + s.probability, 0);
    const rand = Math.random() * totalProb;
    
    let cumulative = 0;
    for (const sym of slotInfo.symbols) {
      cumulative += sym.probability;
      if (rand <= cumulative) {
        return sym.symbol;
      }
    }
    
    // Fallback to last symbol
    return slotInfo.symbols[slotInfo.symbols.length - 1].symbol;
  };

  const animateReels = async (finalReels) => {
    for (let cycle = 0; cycle < 8; cycle++) {
      const tempReels = Array(4).fill(null).map(() => 
        Array(4).fill(null).map(() => getWeightedRandomSymbol())
      );
      setReels(tempReels);
      await new Promise(r => setTimeout(r, 50));
    }
  };

  const getSymbol = (symbolKey) => SYMBOLS[symbolKey]?.emoji || '❓';

  const isWinningCell = (row, col) => {
    if (!lastResult?.winning_paylines) return false;
    return lastResult.winning_paylines.some(wp => 
      wp.line_path.some(([r, c]) => r === row && c === col)
    );
  };

  const renderPaylineOverlay = () => {
    if (!showLines && !highlightedLine) return null;
    
    const linesToShow = highlightedLine 
      ? [highlightedLine] 
      : (lastResult?.winning_paylines?.map(w => w.line_number) || Array.from({length: activeLines}, (_,i) => i+1));
    
    // Grid dimensions for larger cells: 96px each on desktop with 8px gap
    // Mobile: 72px cells with 6px gap
    // We'll use desktop size for overlay since it scales with viewBox
    const cellSize = 104; // 96px + 8px gap
    const startOffset = 52; // Half of cellSize for center
    
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 416 416">
        {linesToShow.map(lineNum => {
          const path = PAYLINES_8[lineNum];
          if (!path) return null;
          
          const color = LINE_COLORS[(lineNum - 1) % LINE_COLORS.length];
          const isWinning = lastResult?.winning_paylines?.some(w => w.line_number === lineNum);
          
          const points = path.map(([row, col]) => {
            const x = startOffset + col * cellSize;
            const y = startOffset + row * cellSize;
            return `${x},${y}`;
          }).join(' ');
          
          return (
            <g key={lineNum}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={isWinning ? 6 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isWinning ? 'animate-pulse' : ''}
                opacity={isWinning ? 1 : 0.6}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  // Default slot info for immediate rendering
  const displaySlotInfo = slotInfo || {
    name: 'Classic Fruits Deluxe',
    rtp: 95.5,
    paytable: {
      diamond: { multipliers: [0, 0, 10, 50, 200] },
      seven: { multipliers: [0, 0, 5, 25, 100] },
      bar: { multipliers: [0, 0, 3, 15, 50] },
      cherry: { multipliers: [0, 0, 2, 10, 30] },
      orange: { multipliers: [0, 0, 2, 8, 25] },
      lemon: { multipliers: [0, 0, 1, 5, 15] },
      wild: { multipliers: [0, 0, 0, 0, 0] }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      {/* XP Popup */}
      {xpGained !== null && (
        <div className="fixed top-20 right-6 z-50 animate-bounce">
          <Badge className="bg-purple-600 text-white text-lg px-4 py-2 shadow-lg shadow-purple-500/30">
            <Sparkles className="w-5 h-5 mr-2" />
            +{xpGained} XP
          </Badge>
        </div>
      )}

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header - Full width */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/slots" className="flex items-center gap-2 text-yellow-500/80 hover:text-yellow-500 transition-colors" data-testid="back-to-slots">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">All Slots</span>
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-yellow-500">{displaySlotInfo.name}</h1>
          <Badge variant="outline" className="text-yellow-500/80 border-yellow-500/30">
            RTP {displaySlotInfo.rtp}%
          </Badge>
        </div>

        {/* Main Slot Cabinet - Much larger on desktop */}
        <div className="max-w-4xl lg:max-w-5xl mx-auto">
          <div className="bg-gradient-to-b from-[#1a1a25] to-[#12121a] rounded-2xl border-2 border-yellow-900/40 shadow-2xl overflow-hidden">

            {/* Reels Area */}
            <div className="p-4 lg:p-6 bg-[#08080c]">
              {/* Grid Container with indicators */}
              <div className="flex flex-col items-center">
                
                {/* Top Line Numbers for Vertical Paylines (5-8) */}
                <div className="flex mb-2" style={{ marginLeft: '52px' }}>
                  {[0,1,2,3].map(col => {
                    const lineNum = col + 5;
                    if (lineNum > activeLines) return <div key={col} className="w-20 lg:w-28 h-8" />;
                    return (
                      <div key={col} className="w-20 lg:w-28 flex justify-center">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer hover:scale-110 transition-transform shadow-lg"
                          style={{ backgroundColor: LINE_COLORS[(lineNum-1) % LINE_COLORS.length] }}
                          onMouseEnter={() => setHighlightedLine(lineNum)}
                          onMouseLeave={() => setHighlightedLine(null)}
                        >
                          {lineNum}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grid with Left indicators */}
                <div className="flex items-stretch">
                  
                  {/* Left Line Numbers for Horizontal Paylines (1-4) */}
                  <div className="flex flex-col justify-around w-12 mr-2">
                    {[0,1,2,3].map(row => {
                      const lineNum = row + 1;
                      if (lineNum > activeLines) return <div key={row} className="h-20 lg:h-28" />;
                      return (
                        <div key={row} className="h-20 lg:h-28 flex items-center justify-center">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer hover:scale-110 transition-transform shadow-lg"
                            style={{ backgroundColor: LINE_COLORS[(lineNum-1) % LINE_COLORS.length] }}
                            onMouseEnter={() => setHighlightedLine(lineNum)}
                            onMouseLeave={() => setHighlightedLine(null)}
                          >
                            {lineNum}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reels Grid - Larger cells */}
                  <div className="relative" data-testid="slot-grid">
                    {renderPaylineOverlay()}
                    
                    <div className="grid grid-rows-4 gap-1.5 lg:gap-2 bg-black/60 p-2 lg:p-3 rounded-xl border border-yellow-900/20">
                      {reels.map((row, rowIdx) => (
                        <div key={rowIdx} className="grid grid-cols-4 gap-1.5 lg:gap-2">
                          {row.map((symbol, colIdx) => {
                            const winning = isWinningCell(rowIdx, colIdx);
                            return (
                              <div 
                                key={colIdx}
                                className={`
                                  w-[72px] h-[72px] lg:w-24 lg:h-24 rounded-lg flex items-center justify-center
                                  text-4xl lg:text-5xl
                                  bg-gradient-to-b from-[#25252f] to-[#18181f] 
                                  border-2 transition-all duration-300
                                  ${winning ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] scale-105 bg-yellow-900/20' : 'border-[#35353f]'}
                                  ${spinning ? 'animate-pulse' : ''}
                                `}
                                data-testid={`cell-${rowIdx}-${colIdx}`}
                              >
                                {getSymbol(symbol)}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Winning Lines Info - Fixed height to prevent layout shift */}
            <div className="bg-black/80 px-4 py-3 border-t border-yellow-900/30 min-h-[60px] flex items-center justify-center">
              {lastResult?.winning_paylines?.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {lastResult.winning_paylines.map((wp, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-900/20 border border-yellow-700/30 cursor-pointer hover:bg-yellow-900/30 transition-colors"
                      onMouseEnter={() => setHighlightedLine(wp.line_number)}
                      onMouseLeave={() => setHighlightedLine(null)}
                    >
                      <div 
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: LINE_COLORS[(wp.line_number-1) % LINE_COLORS.length] }}
                      >
                        {wp.line_number}
                      </div>
                      <span className="text-lg">{getSymbol(wp.symbol)}</span>
                      <span className="text-green-400 font-bold text-sm">+{wp.payout.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-yellow-500/30 text-sm lg:text-base">Spin to win!</span>
              )}
            </div>

            {/* Control Panel - Larger on desktop */}
            <div className="bg-gradient-to-b from-[#1a1a25] to-[#101018] border-t-2 border-yellow-900/40 p-4 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 lg:gap-6">
                
                {/* Left Controls */}
                <div className="flex items-center gap-4 lg:gap-6">
                  {/* Coin Value */}
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-500/60 text-xs lg:text-sm uppercase tracking-wider mb-1">Coin</span>
                    <div className="flex items-center gap-1.5 bg-black/40 rounded-lg px-2 py-1 border border-yellow-900/30">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 lg:h-10 lg:w-10 rounded-md bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500"
                        onClick={() => adjustBetPerLine('down')}
                        disabled={spinning || autoSpin}
                        data-testid="coin-minus"
                      >
                        <Minus className="w-4 h-4 lg:w-5 lg:h-5" />
                      </Button>
                      <input
                        type="number"
                        value={betPerLine}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= MIN_BET) {
                            setBetPerLine(val);
                          }
                        }}
                        step={0.01}
                        min={MIN_BET}
                        disabled={spinning || autoSpin}
                        className="w-20 lg:w-24 text-center font-mono text-yellow-400 text-base lg:text-lg font-bold bg-transparent border-none outline-none focus:ring-1 focus:ring-yellow-500/50 rounded"
                        data-testid="coin-input"
                      />
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 lg:h-10 lg:w-10 rounded-md bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500"
                        onClick={() => adjustBetPerLine('up')}
                        disabled={spinning || autoSpin}
                        data-testid="coin-plus"
                      >
                        <Plus className="w-4 h-4 lg:w-5 lg:h-5" />
                      </Button>
                    </div>
                  </div>

                  {/* Lines */}
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-500/60 text-xs lg:text-sm uppercase tracking-wider mb-1">Lines</span>
                    <div className="flex items-center gap-1.5 bg-black/40 rounded-lg px-2 py-1 border border-yellow-900/30">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 lg:h-10 lg:w-10 rounded-md bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500"
                        onClick={() => adjustLines('down')}
                        disabled={spinning || autoSpin || activeLines <= 1}
                        data-testid="lines-minus"
                      >
                        <Minus className="w-4 h-4 lg:w-5 lg:h-5" />
                      </Button>
                      <span className="w-10 lg:w-12 text-center font-mono text-yellow-400 text-base lg:text-lg font-bold">
                        {activeLines}
                      </span>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 lg:h-10 lg:w-10 rounded-md bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500"
                        onClick={() => adjustLines('up')}
                        disabled={spinning || autoSpin || activeLines >= 8}
                        data-testid="lines-plus"
                      >
                        <Plus className="w-4 h-4 lg:w-5 lg:h-5" />
                      </Button>
                    </div>
                  </div>

                  {/* Total Bet */}
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-500/60 text-xs lg:text-sm uppercase tracking-wider mb-1">Total Bet</span>
                    <div className="bg-black/60 rounded-lg px-4 lg:px-6 py-2 border border-yellow-900/30">
                      <span className="font-mono text-yellow-400 text-lg lg:text-xl font-bold">{totalBet} G</span>
                    </div>
                  </div>
                </div>

                {/* Center - SPIN Button & Auto-Spin */}
                <div className="flex-1 flex justify-center items-center gap-3 lg:gap-4">
                  {/* SPIN Button */}
                  <Button
                    className={`
                      h-14 lg:h-16 px-8 lg:px-12 rounded-xl font-bold text-xl lg:text-2xl uppercase tracking-wider
                      ${spinning && !autoSpin
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                        : 'bg-gradient-to-b from-green-400 via-green-500 to-green-600 hover:from-green-300 hover:via-green-400 hover:to-green-500 text-white shadow-[0_0_30px_rgba(34,197,94,0.5)] hover:shadow-[0_0_40px_rgba(34,197,94,0.7)]'
                      }
                      border-2 border-green-300/50 transition-all duration-200
                    `}
                    onClick={spin}
                    disabled={spinning || autoSpin || parseFloat(totalBet) > (user?.balance || 0)}
                    data-testid="spin-btn"
                  >
                    {spinning && !autoSpin ? (
                      <div className="w-6 h-6 lg:w-7 lg:h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Play className="w-6 h-6 lg:w-7 lg:h-7 mr-2 fill-current" />
                        SPIN
                      </>
                    )}
                  </Button>

                  {/* Auto-Spin Button */}
                  <Button
                    className={`
                      h-14 w-14 lg:h-16 lg:w-16 rounded-xl font-bold uppercase tracking-wider
                      ${autoSpin 
                        ? 'bg-gradient-to-b from-red-400 via-red-500 to-red-600 hover:from-red-300 hover:via-red-400 hover:to-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] border-2 border-red-300/50' 
                        : 'bg-gradient-to-b from-purple-400 via-purple-500 to-purple-600 hover:from-purple-300 hover:via-purple-400 hover:to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] border-2 border-purple-300/50'
                      }
                      transition-all duration-200
                    `}
                    onClick={toggleAutoSpin}
                    disabled={!autoSpin && (spinning || parseFloat(totalBet) > (user?.balance || 0))}
                    data-testid="auto-spin-btn"
                    title={autoSpin ? 'Stop Auto-Spin' : 'Start Auto-Spin'}
                  >
                    {autoSpin ? (
                      <Square className="w-6 h-6 fill-current" />
                    ) : (
                      <RotateCw className="w-6 h-6 lg:w-7 lg:h-7" />
                    )}
                  </Button>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2 lg:gap-3">
                  {/* Lines Toggle */}
                  <Button
                    variant="ghost"
                    className={`h-10 lg:h-11 px-3 lg:px-4 rounded-lg border transition-colors text-sm lg:text-base ${
                      showLines 
                        ? 'bg-yellow-900/40 border-yellow-500/50 text-yellow-400' 
                        : 'bg-black/30 border-yellow-900/30 text-yellow-500/60 hover:text-yellow-500 hover:border-yellow-500/50'
                    }`}
                    onClick={() => setShowLines(!showLines)}
                    data-testid="show-lines-btn"
                  >
                    {showLines ? <EyeOff className="w-4 h-4 lg:w-5 lg:h-5 mr-1" /> : <Eye className="w-4 h-4 lg:w-5 lg:h-5 mr-1" />}
                    Lines
                  </Button>

                  {/* Paytable */}
                  <Dialog open={showPaytable} onOpenChange={setShowPaytable}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-10 lg:h-11 px-3 lg:px-4 rounded-lg bg-black/30 border border-yellow-900/30 text-yellow-500/80 hover:text-yellow-500 hover:border-yellow-500/50 text-sm lg:text-base"
                        data-testid="paytable-btn"
                      >
                        <BookOpen className="w-4 h-4 lg:w-5 lg:h-5 mr-1" />
                        Info
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg bg-[#12121a] border-yellow-900/50">
                      <DialogHeader>
                        <DialogTitle className="text-yellow-500 text-xl">{displaySlotInfo.name} - Paytable</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="max-h-[60vh]">
                        <div className="space-y-4 p-2">
                          <div className="text-sm text-yellow-500/70 border-b border-yellow-900/30 pb-4 space-y-2">
                            <p><strong className="text-yellow-400">8 Straight Paylines:</strong> 4 horizontal rows + 4 vertical columns</p>
                            <p><strong className="text-yellow-400">How to Win:</strong> ALL symbols on a payline must match (full line only)</p>
                            <p><strong className="text-yellow-400">Wild:</strong> Substitutes for any symbol. Only all-wild lines pay 200x</p>
                            <p><strong className="text-yellow-400">Payout:</strong> Bet per Line × Symbol Multiplier</p>
                          </div>
                          <div className="space-y-2">
                            {(slotInfo?.symbols || displaySlotInfo.symbols)?.sort((a,b) => b.multiplier - a.multiplier).map((sym, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-yellow-900/20">
                                <div className="flex items-center gap-4">
                                  <span className="text-4xl">{getSymbol(sym.symbol)}</span>
                                  <span className="text-yellow-500 capitalize font-medium">{sym.symbol.replace('_', ' ')}</span>
                                  {sym.is_wild && <Badge className="bg-yellow-500/20 text-yellow-400">WILD</Badge>}
                                </div>
                                <div className="text-right">
                                  <span className="font-mono text-yellow-400 font-bold text-lg">{sym.multiplier}x</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>

                  {/* Max Bet */}
                  <Button
                    variant="ghost"
                    className="h-10 lg:h-11 px-3 lg:px-4 rounded-lg bg-purple-900/30 border border-purple-500/30 text-purple-400 hover:bg-purple-900/50 hover:border-purple-500/50 text-sm lg:text-base"
                    onClick={setMaxBet}
                    disabled={spinning || autoSpin}
                    data-testid="bet-max-btn"
                  >
                    <Zap className="w-4 h-4 lg:w-5 lg:h-5 mr-1" />
                    MAX
                  </Button>
                </div>
              </div>

              {/* Balance Display */}
              <div className="mt-4 pt-4 border-t border-yellow-900/20 text-center">
                <span className="text-yellow-500/60 text-sm lg:text-base mr-2">Balance:</span>
                <span className="font-mono text-yellow-400 text-xl lg:text-2xl font-bold" data-testid="slot-balance">
                  {formatCurrency(user?.balance)} G
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default SlotMachine;
