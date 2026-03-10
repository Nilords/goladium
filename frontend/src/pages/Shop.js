import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSound } from '../contexts/SoundContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  ShoppingBag, 
  Package, 
  Clock, 
  Sparkles,
  Check,
  AlertCircle,
  ImageIcon
} from 'lucide-react';



const Shop = () => {
  const { user, token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const { playPurchase, playError, playClick } = useSound();
  
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => {
    loadShopItems();
  }, []);

  const loadShopItems = async () => {
    try {
      const response = await fetch(`/api/shop`);
      if (response.ok) {
        const data = await response.json();
        setShopItems(data);
      }
    } catch (error) {
      console.error('Failed to load shop items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (item) => {
    if (!user) return;
    
    if (user.balance < item.price) {
      toast.error(language === 'de' ? 'Spar ein wenig mehr :)' : 'To Poor!');
      playError();
      return;
    }
    
    playClick();
    setPurchasing(item.shop_listing_id);
    
    try {
      const response = await fetch(`/api/shop/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ shop_listing_id: item.shop_listing_id })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        playPurchase(); // Coin sound on successful purchase
        toast.success(
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-400" />
            <span>{data.message}</span>
          </div>
        );
        // Refresh user balance and shop items
        if (refreshUser) refreshUser();
        loadShopItems();
      } else {
        playError();
        toast.error(data.detail || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      playError();
      toast.error(language === 'de' ? 'Kauf fehlgeschlagen' : 'Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  const getRarityGradient = (rarity) => {
    switch (rarity) {
      case 'common': return 'from-gray-500/20 to-gray-600/20 border-gray-500/30';
      case 'uncommon': return 'from-green-500/20 to-green-600/20 border-green-500/30';
      case 'rare': return 'from-blue-500/20 to-blue-600/20 border-blue-500/30';
      case 'epic': return 'from-purple-500/20 to-purple-600/20 border-purple-500/30';
      case 'legendary': return 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30';
      default: return 'from-white/5 to-white/10 border-white/10';
    }
  };

  const getRarityGlow = (rarity) => {
    switch (rarity) {
      case 'uncommon': return 'shadow-green-500/20';
      case 'rare': return 'shadow-blue-500/20';
      case 'epic': return 'shadow-purple-500/20';
      case 'legendary': return 'shadow-yellow-500/30';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <ShoppingBag className="w-8 h-8 text-primary" />
            {language === 'de' ? 'Item Shop' : 'Item Shop'}
          </h1>
          <p className="text-white/50 max-w-lg mx-auto">
            {language === 'de' 
              ? 'Sammle einzigartige Gegenstände.' 
              : 'Collect unique items.'}
          </p>
        </div>

        {/* Info Banner */}
        <div className="mb-8 p-4 rounded-xl bg-primary/10 border border-primary/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-white/80 mb-1">
                <strong>{language === 'de' ? 'Sammlerstücke' : 'Collectibles'}</strong>
              </p>
              <p className="text-white/60">
                {language === 'de' 
                  ? 'Die Sammelobjekte werden nach Ablauf des Shop-Zeitraums nicht mehr erhältlich sein.'
                  : 'The items become unobtainable after the shop period ends.'}
              </p>
            </div>
          </div>
        </div>

        {/* Shop Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shopItems.length === 0 ? (
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="w-16 h-16 text-white/20 mb-4" />
              <p className="text-white/50 text-lg">
                {language === 'de' ? 'Zur Zeit ist hier nichts zu holen.' : 'The shop is currently empty.'}
              </p>
              <p className="text-white/30 text-sm mt-1">
                {language === 'de' ? 'Schau später wieder vorbei!' : 'Check back later!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shopItems.map((item) => (
              <Card 
                key={item.shop_listing_id}
                data-testid={`shop-item-${item.item_id}`}
                className={`bg-gradient-to-br ${getRarityGradient(item.item_rarity)} border-2 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${getRarityGlow(item.item_rarity)}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Badge 
                      className="border-0 text-xs px-2 py-0.5"
                      style={{ backgroundColor: `${item.rarity_color}30`, color: item.rarity_color }}
                    >
                      {item.rarity_display}
                    </Badge>
                    {item.days_remaining !== null && (
                      <div className="flex items-center gap-1 text-white/50 text-xs">
                        <Clock className="w-3 h-3" />
                        <span>
                          {item.days_remaining > 0 
                            ? `${item.days_remaining}d ${item.hours_remaining}h`
                            : `${item.hours_remaining}h`
                          }
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Item Image Placeholder */}
                  <div className="aspect-square rounded-xl bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden">
                    {item.item_image ? (
                      <img 
                        src={item.item_image} 
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4">
                        <Sparkles className="w-12 h-12 mx-auto mb-2" style={{ color: item.rarity_color }} />
                        <ImageIcon className="w-8 h-8 text-white/20 mx-auto" />
                      </div>
                    )}
                  </div>
                  
                  {/* Item Info */}
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">{item.item_name}</h3>
                    <p className="text-white/50 text-sm italic">&ldquo;{item.item_flavor_text}&rdquo;</p>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                      {language === 'de' ? 'Nicht handelbar' : 'Not Tradeable'}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                      {language === 'de' ? 'Sammlerstück' : 'Collectible'}
                    </Badge>
                  </div>
                </CardContent>
                
                <CardFooter className="border-t border-white/5 pt-4">
                  <div className="w-full flex items-center justify-between">
                    <div>
                      <p className="text-white/40 text-xs mb-0.5">
                        {language === 'de' ? 'Preis' : 'Price'}
                      </p>
                      <p className="text-gold font-mono font-bold text-xl">
                        {item.price.toFixed(2)} G
                      </p>
                    </div>
                    <Button
                      data-testid={`buy-${item.item_id}`}
                      onClick={() => handlePurchase(item)}
                      disabled={purchasing === item.shop_listing_id || (user && user.balance < item.price)}
                      className={`px-6 ${
                        user && user.balance >= item.price 
                          ? 'bg-primary hover:bg-primary/80' 
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {purchasing === item.shop_listing_id ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : user && user.balance < item.price ? (
                        language === 'de' ? 'Zu wenig G' : 'Not enough G'
                      ) : (
                        language === 'de' ? 'Kaufen' : 'Buy'
                      )}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Stock Info */}
        {shopItems.some(item => item.stock_sold > 0) && (
          <div className="mt-8 text-center text-white/40 text-sm">
            {language === 'de' 
              ? '✨ Du hast kreative Ideen für neue Items? Dann komm in unseren Discord und teile deine Vorschläge mit uns! Wir freuen uns über jede Inspiration aus der Community – vielleicht wird deine Idee schon bald Teil des Spiels! 🚀'
              : '✨ Got creative ideas for new items? Join our Discord and share your suggestions with us! We love hearing ideas from our community — your concept might become part of the game soon! 🚀'}
          </div>
        )}
      </main>

      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default Shop;
