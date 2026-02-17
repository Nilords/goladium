import React, { useState, useEffect } from 'react';
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
  chestItem,  // { inventory_id, item_id, item_name, item_rarity }
  allChests = [], // All chests of the same type for auto-open
  onChestOpened  // callback when chest is opened
}) => {
  const { token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const [phase, setPhase] = useState('ready'); // ready, opening, reveal, auto-opening, auto-summary
  const [reward, setReward] = useState(null);
  const [showPayoutTable, setShowPayoutTable] = useState(false);
  const [payoutData, setPayoutData] = useState(null);
  
  // Auto-open state
  const [autoOpenAmount, setAutoOpenAmount] = useState(10);
  const [autoOpenResults, setAutoOpenResults] = useState([]);
  const [autoOpenProgress, setAutoOpenProgress] = useState(0);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const [stopAutoOpen, setStopAutoOpen] = useState(false);

  // Load payout table on mount
  useEffect(() => {
    loadPayoutTable();
  }, []);

  // Reset stop flag when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStopAutoOpen(false);
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

  const openSingleChest = async (inventoryId) => {
    const res = await fetch('/api/inventory/open-chest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inventory_id: inventoryId })
    });
    
    if (res.ok) {
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to open chest');
    }
  };

  const openChest = async () => {
    if (!chestItem?.inventory_id) return;
    
    setPhase('opening');
    
    // Animate for suspense
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const data = await openSingleChest(chestItem.inventory_id);
      setReward(data.reward);
      setPhase('reveal');
      
      if (refreshUser) refreshUser();
      if (onChestOpened) onChestOpened(data);
    } catch (err) {
      toast.error(err.message || 'Network error');
      setPhase('ready');
    }
  };

  const startAutoOpen = async () => {
    // Get inventory_ids from the stacked chest item
    // The backend now returns stacked items with inventory_ids array
    let inventoryIds = [];
    
    if (chestItem?.inventory_ids && chestItem.inventory_ids.length > 0) {
      // Backend returns stacked items with inventory_ids
      inventoryIds = chestItem.inventory_ids.slice(0, autoOpenAmount);
    } else {
      // Fallback: collect from allChests array
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
    setPhase('auto-opening');
    setAutoOpenResults([]);
    setAutoOpenProgress(0);
    setStopAutoOpen(false);
    
    const results = [];
    
    for (let i = 0; i < inventoryIds.length; i++) {
      // Check if user wants to stop
      if (stopAutoOpen) {
        break;
      }
      
      try {
        const data = await openSingleChest(inventoryIds[i]);
        results.push(data.reward);
        setAutoOpenResults([...results]);
        setAutoOpenProgress(i + 1);
        
        // Small delay between opens for visual feedback
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        // Skip failed chests
        console.error('Failed to open chest:', err);
      }
    }
    
    setIsAutoOpening(false);
    setPhase('auto-summary');
    
    if (refreshUser) refreshUser();
    if (onChestOpened) onChestOpened({ autoOpen: true, count: results.length });
  };

  const handleClose = () => {
    setPhase('ready');
    setReward(null);
    setAutoOpenResults([]);
    setAutoOpenProgress(0);
    setIsAutoOpening(false);
    setStopAutoOpen(false);
    onClose();
  };

  const getTierGlow = (tier) => {
    switch(tier) {
      case 'good': return 'shadow-[0_0_30px_rgba(34,197,94,0.5)]';
      case 'rare': return 'shadow-[0_0_40px_rgba(168,85,247,0.6)]';
      case 'legendary': return 'shadow-[0_0_50px_rgba(234,179,8,0.7)]';
      default: return '';
    }
  };

  // Calculate auto-open summary
  const getAutoOpenSummary = () => {
    let totalG = 0;
    let items = [];
    let tierCounts = { normal: 0, good: 0, rare: 0, legendary: 0 };
    
    autoOpenResults.forEach(r => {
      if (r.type === 'currency') {
        totalG += r.amount;
        tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
      } else {
        items.push(r);
        tierCounts['legendary'] = (tierCounts['legendary'] || 0) + 1;
      }
    });
    
    return { totalG, items, tierCounts, count: autoOpenResults.length };
  };

  const availableChests = allChests.filter(c => c.item_id === chestItem?.item_id).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0a0a0c] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-yellow-400" />
            {phase === 'reveal' 
              ? (language === 'de' ? 'Belohnung!' : 'Reward!')
              : phase === 'auto-summary'
                ? (language === 'de' ? 'Zusammenfassung' : 'Summary')
                : (chestItem?.item_name || 'Chest')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {language === 'de' ? 'Truhe öffnen und Belohnung erhalten' : 'Open chest and receive reward'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Ready Phase - Show chest */}
          {phase === 'ready' && (
            <div className="text-center space-y-4">
              {/* Chest Icon */}
              <div className="relative mx-auto w-28 h-28">
                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 to-orange-500/20 rounded-2xl animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Package className="w-16 h-16 text-yellow-400" />
                </div>
              </div>

              {/* Chest Info */}
              <div>
                <h3 className="text-lg font-bold text-white mb-1">{chestItem?.item_name}</h3>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {chestItem?.item_rarity}
                </Badge>
              </div>

              {/* Open Button */}
              <Button
                onClick={openChest}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-5 text-lg"
                data-testid="open-chest-btn"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                {language === 'de' ? 'ÖFFNEN!' : 'OPEN!'}
              </Button>

              {/* Auto Open Section */}
              {availableChests > 1 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/50 text-xs mb-3">
                    {language === 'de' ? 'Auto-Öffnen' : 'Auto Open'} ({availableChests} {language === 'de' ? 'verfügbar' : 'available'})
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max={Math.min(availableChests, 1000)}
                      value={autoOpenAmount}
                      onChange={(e) => setAutoOpenAmount(Math.min(Math.max(1, parseInt(e.target.value) || 1), Math.min(availableChests, 1000)))}
                      className="w-24 bg-black/40 border-white/10 text-white text-center"
                      data-testid="auto-open-amount"
                    />
                    <Button
                      onClick={startAutoOpen}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold"
                      data-testid="auto-open-btn"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      {language === 'de' ? `${autoOpenAmount}x Öffnen` : `Open ${autoOpenAmount}x`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Payout Table Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPayoutTable(!showPayoutTable)}
                className="text-white/50 hover:text-white"
              >
                <Info className="w-4 h-4 mr-1" />
                {language === 'de' ? 'Drop-Raten' : 'Drop Rates'}
              </Button>

              {/* Payout Table */}
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

          {/* Opening Phase - Animation */}
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

          {/* Auto-Opening Phase */}
          {phase === 'auto-opening' && (
            <div className="text-center space-y-6 py-4">
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-spin opacity-50 blur-xl" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Package className="w-14 h-14 text-purple-400 animate-pulse" />
                </div>
              </div>
              
              <div>
                <p className="text-white font-bold text-2xl mb-1">
                  {autoOpenProgress} / {Math.min(autoOpenAmount, availableChests)}
                </p>
                <p className="text-white/60 text-sm">
                  {language === 'de' ? 'Truhen geöffnet' : 'Chests opened'}
                </p>
              </div>
              
              {/* Progress bar */}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-200"
                  style={{ width: `${(autoOpenProgress / Math.min(autoOpenAmount, availableChests)) * 100}%` }}
                />
              </div>
              
              {/* Live rewards ticker */}
              {autoOpenResults.length > 0 && (
                <div className="text-left max-h-32 overflow-y-auto space-y-1 p-2 bg-black/20 rounded-lg">
                  {autoOpenResults.slice(-5).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {r.type === 'currency' ? (
                        <>
                          <Coins className={`w-3 h-3 ${r.tier === 'rare' ? 'text-purple-400' : r.tier === 'good' ? 'text-green-400' : 'text-gray-400'}`} />
                          <span className={r.tier === 'rare' ? 'text-purple-400' : r.tier === 'good' ? 'text-green-400' : 'text-white/60'}>
                            +{r.amount.toFixed(2)} G
                          </span>
                        </>
                      ) : (
                        <>
                          <Gift className="w-3 h-3 text-yellow-400" />
                          <span className="text-yellow-400">{r.name}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Stop Button */}
              <Button
                onClick={() => setStopAutoOpen(true)}
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/20"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                {language === 'de' ? 'Stoppen' : 'Stop'}
              </Button>
            </div>
          )}

          {/* Auto-Open Summary Phase */}
          {phase === 'auto-summary' && (
            <div className="text-center space-y-4">
              {(() => {
                const summary = getAutoOpenSummary();
                return (
                  <>
                    <div className="text-4xl font-bold text-green-400 mb-2">
                      +{summary.totalG.toFixed(2)} G
                    </div>
                    <p className="text-white/60 text-sm">
                      {summary.count} {language === 'de' ? 'Truhen geöffnet' : 'chests opened'}
                    </p>
                    
                    {/* Tier breakdown */}
                    <div className="grid grid-cols-4 gap-2 p-3 bg-black/20 rounded-lg">
                      <div className="text-center">
                        <p className="text-gray-400 font-mono text-lg">{summary.tierCounts.normal || 0}</p>
                        <p className="text-white/40 text-xs">Normal</p>
                      </div>
                      <div className="text-center">
                        <p className="text-green-400 font-mono text-lg">{summary.tierCounts.good || 0}</p>
                        <p className="text-white/40 text-xs">{language === 'de' ? 'Gut' : 'Good'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-purple-400 font-mono text-lg">{summary.tierCounts.rare || 0}</p>
                        <p className="text-white/40 text-xs">{language === 'de' ? 'Selten' : 'Rare'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-yellow-400 font-mono text-lg">{summary.items.length}</p>
                        <p className="text-white/40 text-xs">Items</p>
                      </div>
                    </div>
                    
                    {/* Items won */}
                    {summary.items.length > 0 && (
                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-yellow-400 font-bold text-sm mb-2">
                          🎉 {language === 'de' ? 'Items gewonnen!' : 'Items won!'}
                        </p>
                        {summary.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-white">{item.name}</span>
                            <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">{item.rarity}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              
              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                {language === 'de' ? 'Schließen' : 'Close'}
              </Button>
            </div>
          )}

          {/* Reveal Phase - Show single reward */}
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
