import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { Package, Sparkles, Coins, Gift, Info, Zap, StopCircle } from 'lucide-react';

const ChestOpening = ({ 
  isOpen, 
  onClose, 
  chestItem,
  allChests = [],
  onChestOpened
}) => {
  const { token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const [phase, setPhase] = useState('ready');
  const [reward, setReward] = useState(null);
  const [showPayoutTable, setShowPayoutTable] = useState(false);
  const [payoutData, setPayoutData] = useState(null);
  
  // Auto-open state
  const [autoOpenAmount, setAutoOpenAmount] = useState(10);
  const [batchResults, setBatchResults] = useState([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [autoOpenSummary, setAutoOpenSummary] = useState(null);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    loadPayoutTable();
  }, []);

  useEffect(() => {
    if (isOpen) {
      stopRef.current = false;
    }
  }, [isOpen]);

  const loadPayoutTable = async () => {
    try {
      const res = await fetch('/api/chest/payout-table');
      if (res.ok) {
        setPayoutData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load payout table:', err);
    }
  };

  const openSingleChest = async () => {
    if (!chestItem?.inventory_id) return;
    
    setPhase('opening');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const res = await fetch('/api/inventory/open-chest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ inventory_id: chestItem.inventory_id })
      });
      
      if (res.ok) {
        const data = await res.json();
        setReward(data.reward);
        setPhase('reveal');
        if (refreshUser) refreshUser();
        if (onChestOpened) onChestOpened(data);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to open chest');
        setPhase('ready');
      }
    } catch (err) {
      toast.error('Network error');
      setPhase('ready');
    }
  };

  // Calculate animation delay based on tier - legendary is slowest, normal is fastest
  const getAnimationDelay = (tier, totalCount) => {
    // FIXED display times for special drops (unabhängig von Anzahl)
    if (tier === 'legendary') {
      return 5000; // 5 Sekunden für legendäre/goldene Items
    }
    if (tier === 'rare') {
      return 3000; // 3 Sekunden für epische/seltene Pulls
    }
    
    // Dynamic speed for normal drops based on total count
    let baseDelay;
    if (totalCount <= 10) {
      baseDelay = 400; // Slow for few chests
    } else if (totalCount <= 50) {
      baseDelay = 200;
    } else if (totalCount <= 100) {
      baseDelay = 100;
    } else if (totalCount <= 500) {
      baseDelay = 50;
    } else {
      baseDelay = 20; // Very fast for 500+
    }
    
    // Good tier slightly slower
    if (tier === 'good') {
      return baseDelay * 1.5;
    }
    
    return baseDelay;
  };

  const startBatchOpen = async () => {
    // Get inventory_ids from stacked item
    let inventoryIds = [];
    
    if (chestItem?.inventory_ids && chestItem.inventory_ids.length > 0) {
      inventoryIds = chestItem.inventory_ids.slice(0, autoOpenAmount);
    } else {
      const matchingChests = allChests.filter(c => c.item_id === chestItem?.item_id);
      for (const chest of matchingChests) {
        if (chest.inventory_ids) {
          inventoryIds.push(...chest.inventory_ids);
        } else if (chest.inventory_id) {
          inventoryIds.push(chest.inventory_id);
        }
      }
      inventoryIds = inventoryIds.slice(0, autoOpenAmount);
    }
    
    if (inventoryIds.length === 0) {
      toast.error(language === 'de' ? 'Keine Truhen verfügbar' : 'No chests available');
      return;
    }
    
    setIsAutoOpening(true);
    setPhase('batch-processing');
    setBatchResults([]);
    setCurrentResultIndex(0);
    setAutoOpenSummary(null);
    stopRef.current = false;
    
    try {
      // STEP 1: Call batch endpoint - ALL chests processed on server FIRST
      const res = await fetch('/api/inventory/open-chests-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ inventory_ids: inventoryIds })
      });
      
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Batch open failed');
        setPhase('ready');
        setIsAutoOpening(false);
        return;
      }
      
      const data = await res.json();
      const results = data.results;
      
      // STEP 2: Store results and animate through them
      setBatchResults(results);
      setAutoOpenSummary(data.summary);
      setPhase('batch-animating');
      
      // Animate through results with tier-based timing
      for (let i = 0; i < results.length; i++) {
        if (stopRef.current) break;
        
        setCurrentResultIndex(i);
        
        // Get delay based on tier
        const delay = getAnimationDelay(results[i].tier, results.length);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Show summary
      setPhase('auto-summary');
      if (refreshUser) refreshUser();
      if (onChestOpened) onChestOpened({ autoOpen: true, count: results.length });
      
    } catch (err) {
      console.error('Batch open error:', err);
      toast.error('Network error');
      setPhase('ready');
    }
    
    setIsAutoOpening(false);
  };

  const handleClose = () => {
    setPhase('ready');
    setReward(null);
    setBatchResults([]);
    setCurrentResultIndex(0);
    setAutoOpenSummary(null);
    setIsAutoOpening(false);
    stopRef.current = false;
    onClose();
  };

  const stopAnimation = () => {
    stopRef.current = true;
    setPhase('auto-summary');
  };

  const getTierGlow = (tier) => {
    switch(tier) {
      case 'legendary': return 'shadow-[0_0_60px_rgba(234,179,8,0.9)] animate-pulse';
      case 'rare': return 'shadow-[0_0_40px_rgba(168,85,247,0.6)]';
      case 'good': return 'shadow-[0_0_30px_rgba(34,197,94,0.5)]';
      default: return '';
    }
  };

  const availableChests = chestItem?.count || chestItem?.inventory_ids?.length || 
    allChests.filter(c => c.item_id === chestItem?.item_id).reduce((sum, c) => sum + (c.count || 1), 0);

  // Get current result for animation display
  const currentResult = batchResults[currentResultIndex];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0a0a0c] border-white/10 max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-yellow-400" />
            {phase === 'reveal' || phase === 'batch-animating'
              ? (language === 'de' ? 'Belohnung!' : 'Reward!')
              : phase === 'auto-summary'
                ? (language === 'de' ? 'Zusammenfassung' : 'Summary')
                : (chestItem?.item_name || 'Chest')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {language === 'de' ? 'Truhe öffnen und Belohnung erhalten' : 'Open chest and receive reward'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 relative">
          
          {/* Ready Phase */}
          {phase === 'ready' && (
            <div className="text-center space-y-4">
              <div className="relative mx-auto w-28 h-28">
                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 to-orange-500/20 rounded-2xl animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Package className="w-16 h-16 text-yellow-400" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-1">{chestItem?.item_name}</h3>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {chestItem?.item_rarity}
                </Badge>
              </div>

              <Button
                onClick={openSingleChest}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-5 text-lg"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                {language === 'de' ? 'ÖFFNEN!' : 'OPEN!'}
              </Button>

              {availableChests > 1 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/50 text-xs mb-3">
                    {language === 'de' ? 'Auto-Öffnen' : 'Auto Open'} ({availableChests.toLocaleString()} {language === 'de' ? 'verfügbar' : 'available'})
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max={Math.min(availableChests, 1000)}
                      value={autoOpenAmount}
                      onChange={(e) => setAutoOpenAmount(Math.min(Math.max(1, parseInt(e.target.value) || 1), Math.min(availableChests, 1000)))}
                      className="w-24 bg-black/40 border-white/10 text-white text-center"
                    />
                    <Button
                      onClick={startBatchOpen}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      {language === 'de' ? `${autoOpenAmount}x Öffnen` : `Open ${autoOpenAmount}x`}
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPayoutTable(!showPayoutTable)}
                className="text-white/50 hover:text-white"
              >
                <Info className="w-4 h-4 mr-1" />
                {language === 'de' ? 'Drop-Raten' : 'Drop Rates'}
              </Button>

              {showPayoutTable && payoutData && (
                <Card className="bg-black/40 border-white/10">
                  <CardContent className="p-3">
                    <div className="space-y-1.5 text-sm">
                      {payoutData.g_drops.map((drop, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-white/70">{drop.range}</span>
                          <Badge 
                            className="font-mono text-xs"
                            style={{ backgroundColor: `${drop.color}20`, color: drop.color }}
                          >
                            {drop.chance}%
                          </Badge>
                        </div>
                      ))}
                      <div className="flex justify-between items-center border-t border-white/10 pt-1.5">
                        <span className="text-yellow-400 flex items-center gap-1">
                          <Gift className="w-3 h-3" />
                          Item
                        </span>
                        <Badge className="bg-yellow-500/20 text-yellow-400 font-mono text-xs">
                          {payoutData.item_drop.chance}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Single Opening Animation */}
          {phase === 'opening' && (
            <div className="text-center space-y-6 py-8">
              <div className="relative mx-auto w-32 h-32">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 animate-spin opacity-50 blur-xl" />
                <div className="relative w-full h-full flex items-center justify-center animate-bounce">
                  <Package className="w-20 h-20 text-yellow-400 animate-pulse" />
                </div>
              </div>
              <p className="text-white/60 animate-pulse">
                {language === 'de' ? 'Öffne Truhe...' : 'Opening chest...'}
              </p>
            </div>
          )}

          {/* Batch Processing - Server is calculating */}
          {phase === 'batch-processing' && (
            <div className="text-center space-y-6 py-8">
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-spin opacity-70 blur-xl" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Package className="w-14 h-14 text-purple-400 animate-pulse" />
                </div>
              </div>
              <p className="text-white/60 animate-pulse">
                {language === 'de' ? 'Öffne alle Truhen...' : 'Opening all chests...'}
              </p>
            </div>
          )}

          {/* Batch Animating - Show results one by one */}
          {phase === 'batch-animating' && currentResult && (
            <div className="text-center space-y-4">
              {/* Progress */}
              <div className="flex justify-between items-center text-sm text-white/50 mb-2">
                <span>{currentResultIndex + 1} / {batchResults.length}</span>
                <Button
                  onClick={stopAnimation}
                  variant="ghost"
                  size="sm"
                  className="text-white/50 hover:text-red-400"
                >
                  <StopCircle className="w-4 h-4 mr-1" />
                  Skip
                </Button>
              </div>

              {/* Legendary Golden Glitter Effect */}
              {currentResult.tier === 'legendary' && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 0.5}s`,
                        animationDuration: '1s'
                      }}
                    />
                  ))}
                  <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/20 via-transparent to-yellow-500/20 animate-pulse" />
                </div>
              )}

              {/* Rare Purple Glow Effect */}
              {currentResult.tier === 'rare' && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-t from-purple-500/10 via-transparent to-purple-500/10" />
                </div>
              )}

              {/* Reward Display */}
              <div className={`relative mx-auto w-36 h-36 rounded-2xl bg-gradient-to-b from-black to-gray-900 border-2 transition-all duration-300 ${
                currentResult.tier === 'legendary' 
                  ? 'border-yellow-400 scale-110' 
                  : currentResult.tier === 'rare' 
                    ? 'border-purple-500' 
                    : currentResult.tier === 'good'
                      ? 'border-green-500'
                      : 'border-gray-500'
              } ${getTierGlow(currentResult.tier)}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {currentResult.type === 'currency' ? (
                    <div className="text-center">
                      <Coins className={`w-10 h-10 mx-auto mb-2 ${
                        currentResult.tier === 'legendary' ? 'text-yellow-400 animate-bounce' :
                        currentResult.tier === 'rare' ? 'text-purple-400' :
                        currentResult.tier === 'good' ? 'text-green-400' :
                        'text-gray-400'
                      }`} />
                      <p className={`text-2xl font-bold font-mono ${
                        currentResult.tier === 'legendary' ? 'text-yellow-400' :
                        currentResult.tier === 'rare' ? 'text-purple-400' :
                        currentResult.tier === 'good' ? 'text-green-400' :
                        'text-white'
                      }`}>
                        +{currentResult.amount.toFixed(2)}
                      </p>
                      <p className="text-white/60 text-sm">G</p>
                    </div>
                  ) : (
                    <div className="text-center p-3">
                      <Gift className="w-10 h-10 mx-auto mb-2 text-yellow-400 animate-bounce" />
                      <p className="text-yellow-400 font-bold text-sm">{currentResult.name}</p>
                      <Badge className="mt-1 bg-yellow-500/20 text-yellow-400 text-xs">
                        {currentResult.rarity}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Tier Label */}
              <Badge 
                className={`text-sm px-3 py-1 ${currentResult.tier === 'legendary' ? 'animate-pulse text-lg' : ''}`}
                style={{ 
                  backgroundColor: `${currentResult.tier_color}20`, 
                  color: currentResult.tier_color,
                  borderColor: `${currentResult.tier_color}50`
                }}
              >
                {currentResult.type === 'item' ? '🎉 JACKPOT!' : currentResult.tier_label}
              </Badge>

              {/* Running Total */}
              <div className="text-white/50 text-sm">
                {language === 'de' ? 'Bisheriges Total:' : 'Running total:'}{' '}
                <span className="text-green-400 font-mono">
                  +{batchResults.slice(0, currentResultIndex + 1).reduce((sum, r) => sum + (r.amount || 0), 0).toFixed(2)} G
                </span>
              </div>
            </div>
          )}

          {/* Summary Phase */}
          {phase === 'auto-summary' && autoOpenSummary && (
            <div className="text-center space-y-4">
              <div className="text-4xl font-bold text-green-400 mb-2">
                +{autoOpenSummary.total_g.toFixed(2)} G
              </div>
              <p className="text-white/60 text-sm">
                {batchResults.length} {language === 'de' ? 'Truhen geöffnet' : 'chests opened'}
              </p>
              
              {/* Tier breakdown */}
              <div className="grid grid-cols-4 gap-2 p-3 bg-black/20 rounded-lg">
                <div className="text-center">
                  <p className="text-gray-400 font-mono text-lg">{autoOpenSummary.tier_counts.normal || 0}</p>
                  <p className="text-white/40 text-xs">Normal</p>
                </div>
                <div className="text-center">
                  <p className="text-green-400 font-mono text-lg">{autoOpenSummary.tier_counts.good || 0}</p>
                  <p className="text-white/40 text-xs">{language === 'de' ? 'Gut' : 'Good'}</p>
                </div>
                <div className="text-center">
                  <p className="text-purple-400 font-mono text-lg">{autoOpenSummary.tier_counts.rare || 0}</p>
                  <p className="text-white/40 text-xs">{language === 'de' ? 'Selten' : 'Rare'}</p>
                </div>
                <div className="text-center">
                  <p className="text-yellow-400 font-mono text-lg">{autoOpenSummary.items_won?.length || 0}</p>
                  <p className="text-white/40 text-xs">Items</p>
                </div>
              </div>
              
              {/* Items won */}
              {autoOpenSummary.items_won?.length > 0 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 font-bold text-sm mb-2">
                    🎉 {language === 'de' ? 'Items gewonnen!' : 'Items won!'}
                  </p>
                  {autoOpenSummary.items_won.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-white">{item.name}</span>
                      <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">{item.rarity}</Badge>
                    </div>
                  ))}
                </div>
              )}
              
              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                {language === 'de' ? 'Schließen' : 'Close'}
              </Button>
            </div>
          )}

          {/* Single Reveal Phase */}
          {phase === 'reveal' && reward && (
            <div className="text-center space-y-6">
              <div className={`relative mx-auto w-40 h-40 rounded-2xl bg-gradient-to-b from-black to-gray-900 border-2 ${
                reward.type === 'item' 
                  ? 'border-yellow-500' 
                  : reward.tier === 'rare' 
                    ? 'border-purple-500' 
                    : reward.tier === 'good'
                      ? 'border-green-500'
                      : 'border-gray-500'
              } ${getTierGlow(reward.tier)}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {reward.type === 'currency' ? (
                    <div className="text-center">
                      <Coins className={`w-12 h-12 mx-auto mb-2 ${
                        reward.tier === 'rare' ? 'text-purple-400' :
                        reward.tier === 'good' ? 'text-green-400' :
                        'text-gray-400'
                      }`} />
                      <p className={`text-3xl font-bold font-mono ${
                        reward.tier === 'rare' ? 'text-purple-400' :
                        reward.tier === 'good' ? 'text-green-400' :
                        'text-white'
                      }`}>
                        +{reward.amount.toFixed(2)}
                      </p>
                      <p className="text-white/60 text-sm">G</p>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <Gift className="w-12 h-12 mx-auto mb-2 text-yellow-400" />
                      <p className="text-yellow-400 font-bold text-sm">{reward.name}</p>
                      <Badge className="mt-1 bg-yellow-500/20 text-yellow-400 text-xs">
                        {reward.rarity}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Badge 
                  className="text-lg px-4 py-1"
                  style={{ 
                    backgroundColor: `${reward.tier_color}20`, 
                    color: reward.tier_color,
                    borderColor: `${reward.tier_color}50`
                  }}
                >
                  {reward.type === 'item' ? '🎉 ITEM DROP!' : reward.tier_label}
                </Badge>
              </div>

              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                {language === 'de' ? 'Schließen' : 'Close'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChestOpening;
