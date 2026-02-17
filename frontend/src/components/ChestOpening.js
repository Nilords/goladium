import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Package, Sparkles, Coins, Gift, Info, X } from 'lucide-react';

const ChestOpening = ({ 
  isOpen, 
  onClose, 
  chestItem,  // { inventory_id, item_id, item_name, item_rarity }
  onChestOpened  // callback when chest is opened
}) => {
  const { token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const [phase, setPhase] = useState('ready'); // ready, opening, reveal
  const [reward, setReward] = useState(null);
  const [showPayoutTable, setShowPayoutTable] = useState(false);
  const [payoutData, setPayoutData] = useState(null);

  // Load payout table on mount
  useEffect(() => {
    loadPayoutTable();
  }, []);

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

  const openChest = async () => {
    if (!chestItem?.inventory_id) return;
    
    setPhase('opening');
    
    // Animate for suspense
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
        
        // Refresh user balance
        if (refreshUser) refreshUser();
        
        // Callback
        if (onChestOpened) {
          onChestOpened(data);
        }
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

  const handleClose = () => {
    setPhase('ready');
    setReward(null);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0a0a0c] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-yellow-400" />
            {phase === 'reveal' 
              ? (language === 'de' ? 'Belohnung!' : 'Reward!')
              : (chestItem?.item_name || 'Chest')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {language === 'de' ? 'Truhe öffnen und Belohnung erhalten' : 'Open chest and receive reward'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Ready Phase - Show chest */}
          {phase === 'ready' && (
            <div className="text-center space-y-6">
              {/* Chest Icon */}
              <div className="relative mx-auto w-32 h-32">
                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 to-orange-500/20 rounded-2xl animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Package className="w-20 h-20 text-yellow-400" />
                </div>
              </div>

              {/* Chest Info */}
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{chestItem?.item_name}</h3>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  {chestItem?.item_rarity}
                </Badge>
              </div>

              {/* Payout Table Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPayoutTable(!showPayoutTable)}
                className="text-white/50 hover:text-white"
              >
                <Info className="w-4 h-4 mr-1" />
                {language === 'de' ? 'Drop-Raten anzeigen' : 'Show Drop Rates'}
              </Button>

              {/* Payout Table */}
              {showPayoutTable && payoutData && (
                <Card className="bg-black/40 border-white/10">
                  <CardContent className="p-4">
                    <h4 className="text-white/60 text-xs mb-3 uppercase tracking-wide">
                      {language === 'de' ? 'Drop-Wahrscheinlichkeiten' : 'Drop Rates'}
                    </h4>
                    <div className="space-y-2">
                      {payoutData.g_drops.map((drop, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-white/70">{drop.range}</span>
                          <Badge 
                            className="font-mono"
                            style={{ backgroundColor: `${drop.color}20`, color: drop.color, borderColor: `${drop.color}50` }}
                          >
                            {drop.chance}%
                          </Badge>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-sm border-t border-white/10 pt-2 mt-2">
                        <span className="text-yellow-400 flex items-center gap-1">
                          <Gift className="w-3 h-3" />
                          {language === 'de' ? 'Item Drop' : 'Item Drop'}
                        </span>
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono">
                          {payoutData.item_drop.chance}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open Button */}
              <Button
                onClick={openChest}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-6 text-lg"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                {language === 'de' ? 'ÖFFNEN!' : 'OPEN!'}
              </Button>
            </div>
          )}

          {/* Opening Phase - Animation */}
          {phase === 'opening' && (
            <div className="text-center space-y-6 py-8">
              <div className="relative mx-auto w-32 h-32">
                {/* Spinning glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 animate-spin opacity-50 blur-xl" />
                {/* Pulsing chest */}
                <div className="relative w-full h-full flex items-center justify-center animate-bounce">
                  <Package className="w-20 h-20 text-yellow-400 animate-pulse" />
                </div>
              </div>
              <p className="text-white/60 animate-pulse">
                {language === 'de' ? 'Öffne Truhe...' : 'Opening chest...'}
              </p>
            </div>
          )}

          {/* Reveal Phase - Show reward */}
          {phase === 'reveal' && reward && (
            <div className="text-center space-y-6">
              {/* Reward Display */}
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

              {/* Tier Label */}
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

              {/* Close Button */}
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
