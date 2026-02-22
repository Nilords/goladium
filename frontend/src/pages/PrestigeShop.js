import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Crown, 
  Sparkles, 
  Palette,
  Tag,
  Flame,
  ArrowRightLeft,
  Lock,
  Check,
  AlertCircle,
  Info
} from 'lucide-react';



const PrestigeShop = () => {
  const { user, token, refreshUser } = useAuth();
  const { language } = useLanguage();
  
  const [shopData, setShopData] = useState(null);
  const [ownedCosmetics, setOwnedCosmetics] = useState([]);
  const [activeCosmetics, setActiveCosmetics] = useState({});
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [activeTab, setActiveTab] = useState('name_color');
  
  // Convert dialog
  const [showConvert, setShowConvert] = useState(false);
  const [convertAmount, setConvertAmount] = useState(1000);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    loadShopData();
    if (token) loadOwnedCosmetics();
  }, [token]);

  const loadShopData = async () => {
    try {
      const response = await fetch(`/api/prestige/shop`);
      if (response.ok) {
        const data = await response.json();
        setShopData(data);
      }
    } catch (error) {
      console.error('Failed to load prestige shop:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOwnedCosmetics = async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/prestige/owned`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOwnedCosmetics(data.owned || []);
        setActiveCosmetics(data.active || {});
      }
    } catch (error) {
      console.error('Failed to load owned cosmetics:', error);
    }
  };

  const handlePurchase = async (cosmetic) => {
    if (!user) return;
    
    const userBalance = user.balance_a || 0;
    if (userBalance < cosmetic.prestige_cost) {
      toast.error(language === 'de' 
        ? `Nicht genügend A! Du brauchst ${cosmetic.prestige_cost} A.`
        : `Not enough A! You need ${cosmetic.prestige_cost} A.`
      );
      return;
    }
    
    setPurchasing(cosmetic.cosmetic_id);
    
    try {
      const response = await fetch(`/api/prestige/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ cosmetic_id: cosmetic.cosmetic_id })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success(
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-400" />
            <span>{data.message}</span>
          </div>
        );
        if (refreshUser) refreshUser();
        loadOwnedCosmetics();
      } else {
        toast.error(data.detail || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  const handleConvert = async () => {
    const amount = Number(convertAmount);
    if (isNaN(amount) || amount < 1000) {
      toast.error(language === 'de' ? 'Minimum: 1000 G' : 'Minimum: 1000 G');
      return;
    }
    
    setConverting(true);
    
    try {
      const response = await fetch(`/api/currency/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ g_amount: amount })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success(
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            <span>{data.g_spent} G → {data.a_received} A</span>
          </div>
        );
        setShowConvert(false);
        setConvertAmount(1000);
        if (refreshUser) refreshUser();
      } else {
        toast.error(data.detail || 'Conversion failed');
      }
    } catch (error) {
      console.error('Convert error:', error);
      toast.error('Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const isOwned = (cosmeticId) => {
    return ownedCosmetics.some(c => c.cosmetic_id === cosmeticId);
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case 'premium': return 'text-purple-400 bg-purple-500/20';
      case 'legendary': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'tag': return <Tag className="w-5 h-5" />;
      case 'name_color': return <Palette className="w-5 h-5" />;
      case 'jackpot_pattern': return <Flame className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  const renderCosmetic = (cosmetic) => {
    const owned = isOwned(cosmetic.cosmetic_id);
    const userBalance = user?.balance_a || 0;
    const canAfford = userBalance >= cosmetic.prestige_cost;
    const meetsLevel = (user?.level || 1) >= (cosmetic.unlock_level || 0);
    
    return (
      <Card 
        key={cosmetic.cosmetic_id}
        data-testid={`prestige-item-${cosmetic.cosmetic_id}`}
        className={`bg-[#0A0A0C] border transition-all duration-300 ${
          owned 
            ? 'border-green-500/30 bg-green-500/5' 
            : canAfford && meetsLevel
              ? 'border-white/10 hover:border-primary/30 hover:scale-[1.02]'
              : 'border-white/5 opacity-60'
        }`}
      >
        <CardContent className="p-4 space-y-3">
          {/* Preview */}
          <div className="h-16 rounded-lg bg-black/50 flex items-center justify-center">
            {cosmetic.cosmetic_type === 'name_color' ? (
              <span 
                className="text-xl font-bold"
                style={{ color: cosmetic.asset_value }}
              >
                {user?.username || 'Player'}
              </span>
            ) : cosmetic.cosmetic_type === 'tag' ? (
              <span className="text-3xl">{cosmetic.asset_value}</span>
            ) : (
              <div 
                className="w-full h-full rounded-lg opacity-80"
                style={{ background: cosmetic.asset_value }}
              />
            )}
          </div>
          
          {/* Info */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-medium">{cosmetic.display_name}</h3>
              <Badge className={`text-xs ${getTierColor(cosmetic.tier)}`}>
                {cosmetic.tier_display}
              </Badge>
            </div>
            <p className="text-white/40 text-xs italic">{cosmetic.description}</p>
          </div>
          
          {/* Level requirement */}
          {cosmetic.unlock_level > 0 && (
            <div className={`flex items-center gap-1 text-xs ${
              meetsLevel ? 'text-green-400' : 'text-red-400'
            }`}>
              <Lock className="w-3 h-3" />
              <span>Level {cosmetic.unlock_level} required</span>
            </div>
          )}
          
          {/* Price & Action */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-primary font-mono font-bold">
              {cosmetic.prestige_cost} A
            </span>
            
            {owned ? (
              <Badge className="bg-green-500/20 text-green-400 border-0">
                <Check className="w-3 h-3 mr-1" />
                {language === 'de' ? 'Besitzt' : 'Owned'}
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={() => handlePurchase(cosmetic)}
                disabled={!canAfford || !meetsLevel || purchasing === cosmetic.cosmetic_id}
                className={canAfford && meetsLevel ? 'bg-primary hover:bg-primary/80' : 'bg-white/10'}
              >
                {purchasing === cosmetic.cosmetic_id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  language === 'de' ? 'Kaufen' : 'Buy'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const conversionRate = shopData?.conversion_rate || 1000;
  const aToReceive = Math.floor(Number(convertAmount) / conversionRate);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Crown className="w-8 h-8 text-primary" />
            {language === 'de' ? 'Prestige Shop' : 'Prestige Shop'}
          </h1>
          <p className="text-white/50 max-w-lg mx-auto">
            {language === 'de' 
              ? 'Exklusive kosmetische Items für Prestige-Währung (A)' 
              : 'Exclusive cosmetic items for prestige currency (A)'}
          </p>
        </div>

        {/* Balance & Convert */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Card className="bg-[#0A0A0C] border-primary/30 px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-white/40 text-xs mb-1">{language === 'de' ? 'Dein G' : 'Your G'}</p>
                <p className="text-gold font-mono font-bold text-xl">{(user?.balance || 0).toFixed(2)}</p>
              </div>
              <ArrowRightLeft className="w-5 h-5 text-white/30" />
              <div className="text-center">
                <p className="text-white/40 text-xs mb-1">{language === 'de' ? 'Dein A' : 'Your A'}</p>
                <p className="text-primary font-mono font-bold text-xl">{(user?.balance_a || 0).toFixed(0)}</p>
              </div>
            </div>
          </Card>
          
          <Button 
            onClick={() => setShowConvert(true)}
            className="bg-primary hover:bg-primary/80"
            data-testid="convert-currency-btn"
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            {language === 'de' ? 'G zu A konvertieren' : 'Convert G to A'}
          </Button>
        </div>

        {/* Info Banner */}
        <div className="mb-8 p-4 rounded-xl bg-primary/10 border border-primary/20">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-white/80 mb-1">
                <strong>{language === 'de' ? 'Prestige-Items' : 'Prestige Items'}</strong>
              </p>
              <p className="text-white/60">
                {language === 'de' 
                  ? `Kosmetische Items sind permanent an dein Konto gebunden. Sie können nicht gehandelt, verkauft oder zurückgegeben werden. Konvertierungsrate: ${conversionRate} G = 1 A`
                  : `Cosmetic items are permanently account-bound. They cannot be traded, sold, or refunded. Conversion rate: ${conversionRate} G = 1 A`}
              </p>
            </div>
          </div>
        </div>

        {/* Shop Tabs */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-[#0A0A0C]">
              <TabsTrigger value="name_color" className="flex items-center gap-2 data-[state=active]:bg-primary/20">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">{language === 'de' ? 'Farben' : 'Colors'}</span>
              </TabsTrigger>
              <TabsTrigger value="tag" className="flex items-center gap-2 data-[state=active]:bg-primary/20">
                <Tag className="w-4 h-4" />
                <span className="hidden sm:inline">Tags</span>
              </TabsTrigger>
              <TabsTrigger value="jackpot_pattern" className="flex items-center gap-2 data-[state=active]:bg-primary/20">
                <Flame className="w-4 h-4" />
                <span className="hidden sm:inline">{language === 'de' ? 'Muster' : 'Patterns'}</span>
              </TabsTrigger>
            </TabsList>
            
            {['name_color', 'tag', 'jackpot_pattern'].map(type => (
              <TabsContent key={type} value={type}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    {getCategoryIcon(type)}
                    {shopData?.categories?.[type]?.display_name || type}
                  </h2>
                  <p className="text-white/40 text-sm">
                    {shopData?.categories?.[type]?.description}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shopData?.cosmetics
                    ?.filter(c => c.cosmetic_type === type)
                    .map(renderCosmetic)}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      {/* Convert Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="bg-[#0A0A0C] border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              {language === 'de' ? 'G zu A konvertieren' : 'Convert G to A'}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {language === 'de' 
                ? `Konvertierungsrate: ${conversionRate} G = 1 A. Dies kann nicht rückgängig gemacht werden.`
                : `Conversion rate: ${conversionRate} G = 1 A. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-white/60 text-sm mb-2 block">
                {language === 'de' ? 'G Betrag' : 'G Amount'}
              </label>
              <Input
                type="number"
                min={500}
                step={500}
                value={convertAmount}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 500;
                  setConvertAmount(Math.max(500, val));
                }}
                className="bg-black/50 border-white/10 text-white"
              />
            </div>
            
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/60">{language === 'de' ? 'Du gibst' : 'You give'}</span>
                <span className="text-gold font-mono">{convertAmount} G</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">{language === 'de' ? 'Du erhältst' : 'You receive'}</span>
                <span className="text-primary font-mono font-bold">{aToReceive} A</span>
              </div>
            </div>
            
            {user?.balance < convertAmount && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{language === 'de' ? 'Nicht genügend G' : 'Insufficient G'}</span>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConvert(false)}
              className="flex-1 border-white/10"
            >
              {language === 'de' ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button
              onClick={handleConvert}
              disabled={converting || (user?.balance || 0) < Number(convertAmount) || aToReceive < 1}
              className="flex-1 bg-primary hover:bg-primary/80"
              data-testid="confirm-convert-btn"
            >
              {converting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                language === 'de' ? 'Konvertieren' : 'Convert'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default PrestigeShop;
