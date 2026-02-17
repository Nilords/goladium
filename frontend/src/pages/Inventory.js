import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import ChestOpening from '../components/ChestOpening';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
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
  Package, 
  Sparkles, 
  Calendar,
  ShoppingBag,
  Gift,
  Trophy,
  ArrowRight,
  ImageIcon,
  Lock,
  Unlock,
  Info,
  AlertTriangle,
  Coins
} from 'lucide-react';
import { Link } from 'react-router-dom';



const Inventory = () => {
  const { user, token, refreshUser } = useAuth();
  const { language } = useLanguage();
  
  const [inventory, setInventory] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showSellConfirm, setShowSellConfirm] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellAmount, setSellAmount] = useState(1);
  
  // Chest opening state
  const [chestToOpen, setChestToOpen] = useState(null);
  const [showChestDialog, setShowChestDialog] = useState(false);

  const isChest = (item) => {
    return item?.item_id?.includes('chest') || item?.category === 'chest';
  };

  const handleItemClick = (item) => {
    if (isChest(item)) {
      setChestToOpen(item);
      setShowChestDialog(true);
    } else {
      setSelectedItem(item);
    }
  };

  const handleChestOpened = async () => {
    await loadInventory();
    await refreshUser();
  };

  useEffect(() => {
    loadInventory();
  }, [token]);

  const loadInventory = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`/api/inventory`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setInventory(data.items || []);
        setTotalItems(data.total_items || 0);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSellClick = () => {
    setSellAmount(1);
    setShowSellConfirm(true);
  };

  const handleConfirmSell = async () => {
    if (!selectedItem) return;
    
    setSelling(true);
    try {
      // Check if we're selling multiple items
      const itemCount = selectedItem.count || 1;
      const actualSellAmount = Math.min(sellAmount, itemCount);
      
      if (actualSellAmount > 1 && selectedItem.inventory_ids?.length > 1) {
        // Batch sell - use first N inventory_ids
        const idsToSell = selectedItem.inventory_ids.slice(0, actualSellAmount);
        
        const response = await fetch(`/api/inventory/sell-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          body: JSON.stringify({ inventory_ids: idsToSell })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          toast.success(
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-gold" />
              <span>
                {language === 'de' 
                  ? `${data.items_sold}x ${selectedItem.item_name} für ${data.total_sell_amount.toFixed(2)} G verkauft!`
                  : `Sold ${data.items_sold}x ${selectedItem.item_name} for ${data.total_sell_amount.toFixed(2)} G!`}
              </span>
            </div>
          );
          setShowSellConfirm(false);
          setSelectedItem(null);
          loadInventory();
          if (refreshUser) refreshUser();
        } else {
          toast.error(data.detail || 'Failed to sell items');
        }
      } else {
        // Single sell
        const response = await fetch(`/api/inventory/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          body: JSON.stringify({ inventory_id: selectedItem.inventory_id })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          toast.success(
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-gold" />
              <span>
                {language === 'de' 
                  ? `${selectedItem.item_name} für ${data.sell_amount.toFixed(2)} G verkauft!`
                  : `Sold ${selectedItem.item_name} for ${data.sell_amount.toFixed(2)} G!`}
              </span>
            </div>
          );
          setShowSellConfirm(false);
          setSelectedItem(null);
          loadInventory();
          if (refreshUser) refreshUser();
        } else {
          toast.error(data.detail || 'Failed to sell item');
        }
      }
    } catch (error) {
      console.error('Sell error:', error);
      toast.error(language === 'de' ? 'Verkauf fehlgeschlagen' : 'Failed to sell item');
    } finally {
      setSelling(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAcquiredFromIcon = (source) => {
    switch (source) {
      case 'shop': return <ShoppingBag className="w-4 h-4" />;
      case 'trade': return <ArrowRight className="w-4 h-4" />;
      case 'gamepass': return <Trophy className="w-4 h-4" />;
      case 'reward': return <Gift className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getAcquiredFromLabel = (source) => {
    const labels = {
      shop: language === 'de' ? 'Shop' : 'Shop',
      trade: language === 'de' ? 'Handel' : 'Trade',
      gamepass: language === 'de' ? 'Gamepass' : 'Gamepass',
      reward: language === 'de' ? 'Belohnung' : 'Reward'
    };
    return labels[source] || source;
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

  // Backend now returns stacked items with count and inventory_ids
  // No need for frontend grouping anymore

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            {language === 'de' ? 'Inventar' : 'Inventory'}
          </h1>
          <p className="text-white/50">
            {language === 'de' 
              ? `${totalItems} Gegenstand${totalItems !== 1 ? 'stände' : ''} in deiner Sammlung` 
              : `${totalItems} item${totalItems !== 1 ? 's' : ''} in your collection`}
          </p>
        </div>

        {/* Info Banner */}
        <div className="mb-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-white/80 mb-1">
                <strong>{language === 'de' ? 'Dein Besitz' : 'Your Belongings'}</strong>
              </p>
              <p className="text-white/60">
                {language === 'de' 
                  ? 'Gegenstände in deinem Inventar überstehen Wirtschafts-Resets. Du kannst Gegenstände für 70% ihres Wertes verkaufen (30% Gebühr).'
                  : 'Items in your inventory persist across economy resets. You can sell items for 70% of their value (30% fee).'}
              </p>
            </div>
          </div>
        </div>

        {/* Inventory Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : inventory.length === 0 ? (
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="w-16 h-16 text-white/20 mb-4" />
              <p className="text-white/50 text-lg mb-2">
                {language === 'de' ? 'Dein Inventar ist leer' : 'Your inventory is empty'}
              </p>
              <p className="text-white/30 text-sm mb-6">
                {language === 'de' ? 'Besuche den Shop, um Gegenstände zu kaufen!' : 'Visit the shop to buy items!'}
              </p>
              <Link to="/shop">
                <Button className="bg-primary hover:bg-primary/80">
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  {language === 'de' ? 'Zum Shop' : 'Go to Shop'}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {inventory.map((item) => (
              <Card 
                key={item.inventory_id}
                data-testid={`inventory-item-${item.item_id}`}
                onClick={() => handleItemClick(item)}
                className={`bg-gradient-to-br ${getRarityGradient(item.item_rarity)} border cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${isChest(item) ? 'ring-2 ring-yellow-500/50' : ''}`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Item Image */}
                  <div className="aspect-square rounded-lg bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden relative">
                    {item.item_image ? (
                      <img 
                        src={item.item_image} 
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                      />
                    ) : isChest(item) ? (
                      <Package className="w-10 h-10 text-yellow-400" />
                    ) : (
                      <Sparkles className="w-10 h-10" style={{ color: item.rarity_color }} />
                    )}
                    
                    {/* Count Badge */}
                    {item.count > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-mono px-2 py-0.5 rounded-full">
                        x{item.count}
                      </div>
                    )}
                    
                    {/* Chest Open Badge */}
                    {isChest(item) && (
                      <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        {language === 'de' ? 'Öffnen!' : 'Open!'}
                      </div>
                    )}
                  </div>
                  
                  {/* Item Info */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Badge 
                        className="border-0 text-xs px-1.5 py-0"
                        style={{ backgroundColor: `${item.rarity_color}30`, color: item.rarity_color }}
                      >
                        {item.rarity_display}
                      </Badge>
                      <span className="text-gold font-mono text-xs">
                        {(item.purchase_price || 0).toFixed(0)} G
                      </span>
                    </div>
                    <h3 className="text-white font-medium text-sm truncate">{item.item_name}</h3>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Item Detail Dialog */}
      <Dialog open={!!selectedItem && !showSellConfirm} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="bg-[#0A0A0C] border-white/10 max-w-md">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    className="border-0"
                    style={{ backgroundColor: `${selectedItem.rarity_color}30`, color: selectedItem.rarity_color }}
                  >
                    {selectedItem.rarity_display}
                  </Badge>
                  {selectedItem.count > 1 && (
                    <Badge variant="outline" className="border-white/20 text-white/60">
                      x{selectedItem.count} {language === 'de' ? 'besitzt' : 'owned'}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-white text-xl">{selectedItem.item_name}</DialogTitle>
                <DialogDescription className="text-white/50 italic">
                  &ldquo;{selectedItem.item_flavor_text}&rdquo;
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Item Image */}
                <div className={`aspect-square rounded-xl bg-gradient-to-br ${getRarityGradient(selectedItem.item_rarity)} border border-white/10 flex items-center justify-center overflow-hidden`}>
                  {selectedItem.item_image ? (
                    <img 
                      src={selectedItem.item_image} 
                      alt={selectedItem.item_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <Sparkles className="w-16 h-16 mx-auto mb-2" style={{ color: selectedItem.rarity_color }} />
                      <ImageIcon className="w-8 h-8 text-white/20 mx-auto" />
                    </div>
                  )}
                </div>
                
                {/* Item Details */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60 text-sm">{language === 'de' ? 'Wert' : 'Value'}</span>
                    <span className="text-gold font-mono font-bold">
                      {(selectedItem.purchase_price || 0).toFixed(2)} G
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60 text-sm">{language === 'de' ? 'Erworben von' : 'Acquired from'}</span>
                    <div className="flex items-center gap-2 text-white">
                      {getAcquiredFromIcon(selectedItem.acquired_from)}
                      <span className="text-sm">{getAcquiredFromLabel(selectedItem.acquired_from)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60 text-sm">{language === 'de' ? 'Erworben am' : 'Acquired on'}</span>
                    <div className="flex items-center gap-2 text-white">
                      <Calendar className="w-4 h-4 text-white/60" />
                      <span className="text-sm">{formatDate(selectedItem.acquired_at)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60 text-sm">{language === 'de' ? 'Status' : 'Status'}</span>
                    <div className="flex items-center gap-2">
                      {selectedItem.is_tradeable ? (
                        <Badge className="bg-green-500/20 text-green-400 border-0">
                          <Unlock className="w-3 h-3 mr-1" />
                          {language === 'de' ? 'Handelbar' : 'Tradeable'}
                        </Badge>
                      ) : (
                        <Badge className="bg-white/10 text-white/60 border-0">
                          <Lock className="w-3 h-3 mr-1" />
                          {language === 'de' ? 'Nicht handelbar' : 'Not Tradeable'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSellClick}
                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                    data-testid="sell-item-btn"
                  >
                    <Coins className="w-4 h-4 mr-2" />
                    {language === 'de' ? 'Verkaufen' : 'Sell'}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 border-white/10 text-white/40"
                    disabled
                  >
                    {language === 'de' ? 'Handeln (bald)' : 'Trade (coming soon)'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sell Confirmation Dialog */}
      <Dialog open={showSellConfirm} onOpenChange={setShowSellConfirm}>
        <DialogContent className="bg-[#0A0A0C] border-white/10 max-w-sm">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  {language === 'de' ? 'Gegenstand verkaufen?' : 'Sell Item?'}
                </DialogTitle>
                <DialogDescription className="text-white/60">
                  {language === 'de' 
                    ? 'Bist du sicher, dass du diesen Gegenstand verkaufen möchtest?'
                    : 'Are you sure you want to sell this item?'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* Item Preview */}
                <div className="flex items-center gap-4 p-3 rounded-lg bg-white/5">
                  <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center">
                    <Sparkles className="w-6 h-6" style={{ color: selectedItem.rarity_color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{selectedItem.item_name}</p>
                    <Badge 
                      className="border-0 text-xs mt-1"
                      style={{ backgroundColor: `${selectedItem.rarity_color}30`, color: selectedItem.rarity_color }}
                    >
                      {selectedItem.rarity_display}
                    </Badge>
                  </div>
                </div>
                
                {/* Amount Selector - only show if multiple items */}
                {(selectedItem.count || 1) > 1 && (
                  <div className="p-3 rounded-lg bg-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/60 text-sm">{language === 'de' ? 'Anzahl' : 'Amount'}</span>
                      <span className="text-white/40 text-xs">
                        {language === 'de' ? 'Max:' : 'Max:'} {selectedItem.count}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSellAmount(1)}
                        className="border-white/10 text-white/60 hover:text-white"
                      >
                        1
                      </Button>
                      <input
                        type="range"
                        min="1"
                        max={selectedItem.count}
                        value={sellAmount}
                        onChange={(e) => setSellAmount(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSellAmount(selectedItem.count)}
                        className="border-white/10 text-white/60 hover:text-white"
                      >
                        {language === 'de' ? 'Alle' : 'All'}
                      </Button>
                    </div>
                    <p className="text-center text-white font-mono text-lg mt-2">
                      {sellAmount}x
                    </p>
                  </div>
                )}
                
                {/* Price Breakdown */}
                <div className="space-y-2 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">
                      {language === 'de' ? 'Wert' : 'Value'} {sellAmount > 1 ? `(${sellAmount}x)` : ''}
                    </span>
                    <span className="text-white font-mono">
                      {((selectedItem.purchase_price || 0) * sellAmount).toFixed(2)} G
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">{language === 'de' ? 'Gebühr (30%)' : 'Fee (30%)'}</span>
                    <span className="text-red-400 font-mono">
                      -{((selectedItem.purchase_price || 0) * 0.3 * sellAmount).toFixed(2)} G
                    </span>
                  </div>
                  <div className="border-t border-yellow-500/20 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-white font-medium">{language === 'de' ? 'Du erhältst' : 'You receive'}</span>
                      <span className="text-green-400 font-mono font-bold">
                        {((selectedItem.sell_value || ((selectedItem.purchase_price || 0) * 0.7)) * sellAmount).toFixed(2)} G
                      </span>
                    </div>
                  </div>
                </div>
                
                <p className="text-white/40 text-xs text-center">
                  {language === 'de' 
                    ? 'Diese Aktion kann nicht rückgängig gemacht werden.'
                    : 'This action cannot be undone.'}
                </p>
              </div>
              
              <DialogFooter className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSellConfirm(false)}
                  className="flex-1 border-white/10"
                >
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Button>
                <Button
                  onClick={handleConfirmSell}
                  disabled={selling}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                  data-testid="confirm-sell-btn"
                >
                  {selling ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Coins className="w-4 h-4 mr-2" />
                      {sellAmount > 1 
                        ? (language === 'de' ? `${sellAmount}x Verkaufen` : `Sell ${sellAmount}x`)
                        : (language === 'de' ? 'Verkaufen' : 'Sell')
                      }
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
      <LiveWinFeed />
      <Chat />
      
      {/* Chest Opening Dialog */}
      <ChestOpening
        isOpen={showChestDialog}
        onClose={() => {
          setShowChestDialog(false);
          setChestToOpen(null);
        }}
        chestItem={chestToOpen}
        allChests={inventory.filter(item => isChest(item))}
        onChestOpened={handleChestOpened}
      />
    </div>
  );
};

export default Inventory;
