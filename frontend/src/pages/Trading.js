import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeftRight, Search, Package, Coins, X, Check, RotateCcw, Clock, CheckCircle, AlertTriangle, User, Inbox, Send, TrendingUp } from 'lucide-react';
import Navbar from '../components/Navbar';



// Rarity colors
const RARITY_COLORS = {
  common: { bg: 'bg-gray-600', border: 'border-gray-500', text: 'text-gray-300' },
  uncommon: { bg: 'bg-green-600', border: 'border-green-500', text: 'text-green-400' },
  rare: { bg: 'bg-blue-600', border: 'border-blue-500', text: 'text-blue-400' },
  epic: { bg: 'bg-purple-600', border: 'border-purple-500', text: 'text-purple-400' },
  legendary: { bg: 'bg-yellow-600', border: 'border-yellow-500', text: 'text-yellow-400' }
};

const Trading = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('inbound');
  const [inboundTrades, setInboundTrades] = useState([]);
  const [outboundTrades, setOutboundTrades] = useState([]);
  const [completedTrades, setCompletedTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New trade dialog
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [myInventory, setMyInventory] = useState([]);
  const [theirInventory, setTheirInventory] = useState([]);
  const [selectedMyItems, setSelectedMyItems] = useState([]);
  const [selectedTheirItems, setSelectedTheirItems] = useState([]);
  const [offeredG, setOfferedG] = useState(0);
  const [requestedG, setRequestedG] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Trade detail dialog
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [showTradeDetail, setShowTradeDetail] = useState(false);
  
  // Counter offer mode
  const [counterMode, setCounterMode] = useState(false);
  const [counterTradeId, setCounterTradeId] = useState(null);

  // Navigate to Inventory Analytics
  const goToInventoryAnalytics = () => {
    navigate('/profile?tab=analytics&view=inventory');
  };

  useEffect(() => {
    if (token) {
      loadTrades();
    }
  }, [token]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const [inbound, outbound, completed] = await Promise.all([
        fetch(`/api/trades/inbound`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json()),
        fetch(`/api/trades/outbound`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json()),
        fetch(`/api/trades/completed`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json())
      ]);
      
      setInboundTrades(inbound.trades || []);
      setOutboundTrades(outbound.trades || []);
      setCompletedTrades(completed.trades || []);
    } catch (error) {
      console.error('Failed to load trades:', error);
      toast.error('Fehler beim Laden der Trades');
    } finally {
      setLoading(false);
    }
  };

  const searchUser = async () => {
    if (!searchUsername.trim()) return;
    
    setSearchLoading(true);
    try {
      const response = await fetch(`/api/users/search/${encodeURIComponent(searchUsername)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Benutzer nicht gefunden');
        return;
      }
      
      const userData = await response.json();
      setTargetUser(userData);
      
      // Load both inventories
      const [myInv, theirInv] = await Promise.all([
        fetch(`/api/trades/user-inventory/${user.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json()),
        fetch(`/api/trades/user-inventory/${userData.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json())
      ]);
      
      setMyInventory(myInv.items || []);
      setTheirInventory(theirInv.items || []);
      
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Fehler bei der Suche');
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleMyItem = (item) => {
    if (selectedMyItems.find(i => i.inventory_id === item.inventory_id)) {
      setSelectedMyItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
    } else if (selectedMyItems.length < 10) {
      setSelectedMyItems(prev => [...prev, item]);
    } else {
      toast.error('Maximal 10 Items pro Seite');
    }
  };

  const toggleTheirItem = (item) => {
    if (selectedTheirItems.find(i => i.inventory_id === item.inventory_id)) {
      setSelectedTheirItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
    } else if (selectedTheirItems.length < 10) {
      setSelectedTheirItems(prev => [...prev, item]);
    } else {
      toast.error('Maximal 10 Items pro Seite');
    }
  };

  const createTrade = async () => {
    if (!targetUser) return;
    if (selectedMyItems.length === 0 && selectedTheirItems.length === 0 && offeredG === 0 && requestedG === 0) {
      toast.error('Trade muss mindestens ein Item oder G enthalten');
      return;
    }
    
    try {
      const response = await fetch(`/api/trades/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          recipient_username: targetUser.username,
          offered_items: selectedMyItems.map(i => i.inventory_id),
          offered_g: parseFloat(offeredG) || 0,
          requested_items: selectedTheirItems.map(i => i.inventory_id),
          requested_g: parseFloat(requestedG) || 0
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Fehler beim Erstellen des Trades');
        return;
      }
      
      toast.success('Trade erfolgreich erstellt!');
      resetNewTrade();
      loadTrades();
      setActiveTab('outbound');
      
    } catch (error) {
      console.error('Create trade error:', error);
      toast.error('Fehler beim Erstellen des Trades');
    }
  };

  const sendCounterOffer = async () => {
    if (!counterTradeId) return;
    
    try {
      const response = await fetch(`/api/trades/${counterTradeId}/counter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          offered_items: selectedMyItems.map(i => i.inventory_id),
          offered_g: parseFloat(offeredG) || 0,
          requested_items: selectedTheirItems.map(i => i.inventory_id),
          requested_g: parseFloat(requestedG) || 0
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Fehler beim Gegenangebot');
        return;
      }
      
      toast.success('Gegenangebot gesendet!');
      resetNewTrade();
      loadTrades();
      setActiveTab('outbound');
      
    } catch (error) {
      console.error('Counter error:', error);
      toast.error('Fehler beim Gegenangebot');
    }
  };

  const acceptTrade = async (tradeId) => {
    try {
      const response = await fetch(`/api/trades/${tradeId}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Fehler beim Akzeptieren');
        return;
      }
      
      const result = await response.json();
      toast.success('Trade abgeschlossen! ' + (result.total_fee_burned > 0 ? `${result.total_fee_burned.toFixed(2)} G Gebühr verbrannt.` : ''));
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Accept error:', error);
      toast.error('Fehler beim Akzeptieren');
    }
  };

  const rejectTrade = async (tradeId) => {
    try {
      const response = await fetch(`/api/trades/${tradeId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Fehler beim Ablehnen');
        return;
      }
      
      toast.success('Trade abgelehnt');
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('Fehler beim Ablehnen');
    }
  };

  const cancelTrade = async (tradeId) => {
    try {
      const response = await fetch(`/api/trades/${tradeId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Fehler beim Abbrechen');
        return;
      }
      
      toast.success('Trade abgebrochen');
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Cancel error:', error);
      toast.error('Fehler beim Abbrechen');
    }
  };

  const startCounterOffer = async (trade) => {
    setCounterMode(true);
    setCounterTradeId(trade.trade_id);
    setShowTradeDetail(false);
    setShowNewTrade(true);
    
    // Set target user as the initiator of the original trade
    setTargetUser({
      user_id: trade.initiator.user_id,
      username: trade.initiator.username
    });
    
    // Load inventories
    try {
      const [myInv, theirInv] = await Promise.all([
        fetch(`/api/trades/user-inventory/${user.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json()),
        fetch(`/api/trades/user-inventory/${trade.initiator.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }).then(r => r.json())
      ]);
      
      setMyInventory(myInv.items || []);
      setTheirInventory(theirInv.items || []);
      
      // Pre-select items from the original trade (swapped)
      const myItemIds = trade.recipient.items.map(i => i.inventory_id);
      const theirItemIds = trade.initiator.items.map(i => i.inventory_id);
      
      setSelectedMyItems((myInv.items || []).filter(i => myItemIds.includes(i.inventory_id)));
      setSelectedTheirItems((theirInv.items || []).filter(i => theirItemIds.includes(i.inventory_id)));
      setOfferedG(trade.recipient.g_amount || 0);
      setRequestedG(trade.initiator.g_amount || 0);
      
    } catch (error) {
      console.error('Load inventories error:', error);
    }
  };

  const resetNewTrade = () => {
    setShowNewTrade(false);
    setSearchUsername('');
    setTargetUser(null);
    setMyInventory([]);
    setTheirInventory([]);
    setSelectedMyItems([]);
    setSelectedTheirItems([]);
    setOfferedG(0);
    setRequestedG(0);
    setCounterMode(false);
    setCounterTradeId(null);
  };

  const openTradeDetail = (trade) => {
    setSelectedTrade(trade);
    setShowTradeDetail(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateFee = (gAmount) => {
    if (!gAmount || gAmount <= 0) return 0;
    return Math.round(gAmount * 0.30 * 100) / 100;
  };

  // Trade Card Component
  const TradeCard = ({ trade, type }) => {
    const isInbound = type === 'inbound';
    const isOutbound = type === 'outbound';
    const isCompleted = type === 'completed';
    const otherParty = isInbound ? trade.initiator : trade.recipient;
    const myOffer = isInbound ? trade.recipient : trade.initiator;
    const theirOffer = isInbound ? trade.initiator : trade.recipient;
    
    return (
      <Card 
        className="bg-slate-800/50 border-slate-700 hover:border-slate-600 cursor-pointer transition-all"
        onClick={() => openTradeDetail(trade)}
        data-testid={`trade-card-${trade.trade_id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-white">{otherParty.username}</span>
              {trade.is_counter && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-400">
                  Gegenangebot
                </Badge>
              )}
            </div>
            <Badge 
              variant={isCompleted ? "default" : "outline"} 
              className={isCompleted ? "bg-green-600" : isInbound ? "border-blue-500 text-blue-400" : "border-amber-500 text-amber-400"}
            >
              {isCompleted ? 'Abgeschlossen' : isInbound ? 'Eingehend' : 'Ausgehend'}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* What I give */}
            <div className="space-y-1">
              <span className="text-red-400 text-xs">Du gibst:</span>
              <div className="flex flex-wrap gap-1">
                {myOffer.items.slice(0, 3).map((item, idx) => (
                  <Badge key={idx} variant="outline" className={`text-xs ${RARITY_COLORS[item.item_rarity]?.border}`}>
                    {item.item_name}
                  </Badge>
                ))}
                {myOffer.items.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{myOffer.items.length - 3}</Badge>
                )}
                {myOffer.g_amount > 0 && (
                  <Badge className="bg-yellow-600 text-xs">{myOffer.g_amount} G</Badge>
                )}
                {myOffer.items.length === 0 && myOffer.g_amount === 0 && (
                  <span className="text-slate-500 text-xs">Nichts</span>
                )}
              </div>
            </div>
            
            {/* What I receive */}
            <div className="space-y-1">
              <span className="text-green-400 text-xs">Du bekommst:</span>
              <div className="flex flex-wrap gap-1">
                {theirOffer.items.slice(0, 3).map((item, idx) => (
                  <Badge key={idx} variant="outline" className={`text-xs ${RARITY_COLORS[item.item_rarity]?.border}`}>
                    {item.item_name}
                  </Badge>
                ))}
                {theirOffer.items.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{theirOffer.items.length - 3}</Badge>
                )}
                {theirOffer.g_amount > 0 && (
                  <Badge className="bg-yellow-600 text-xs">{theirOffer.g_amount} G</Badge>
                )}
                {theirOffer.items.length === 0 && theirOffer.g_amount === 0 && (
                  <span className="text-slate-500 text-xs">Nichts</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-3 text-xs text-slate-500">
            <Clock className="w-3 h-3 inline mr-1" />
            {formatDate(isCompleted ? trade.completed_at : trade.created_at)}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Item Selection Component
  const ItemSelector = ({ items, selected, onToggle, title, emptyText }) => (
    <div className="space-y-2">
      <h4 className="font-medium text-slate-300">{title}</h4>
      {items.length === 0 ? (
        <p className="text-slate-500 text-sm">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
          {items.map(item => {
            const isSelected = selected.find(i => i.inventory_id === item.inventory_id);
            return (
              <div
                key={item.inventory_id}
                onClick={() => onToggle(item)}
                className={`p-2 rounded border cursor-pointer transition-all ${
                  isSelected 
                    ? 'border-blue-500 bg-blue-500/20' 
                    : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-medium text-white truncate">{item.item_name}</div>
                <Badge variant="outline" className={`text-xs mt-1 ${RARITY_COLORS[item.item_rarity]?.border} ${RARITY_COLORS[item.item_rarity]?.text}`}>
                  {item.item_rarity}
                </Badge>
                {isSelected && <Check className="w-3 h-3 text-blue-400 absolute top-1 right-1" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col" data-testid="trading-page">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ArrowLeftRight className="w-8 h-8 text-blue-400" />
              <h1 className="text-2xl font-bold text-white">Trading</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Inventory Analytics Shortcut */}
              <Button 
                onClick={goToInventoryAnalytics}
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                data-testid="inventory-analytics-btn"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {language === 'de' ? 'Inventar-Analyse' : 'Inventory Analytics'}
              </Button>
              <Button 
                onClick={() => setShowNewTrade(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="new-trade-btn"
              >
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                {language === 'de' ? 'Neuer Trade' : 'New Trade'}
              </Button>
            </div>
          </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="inbound" className="data-[state=active]:bg-blue-600" data-testid="tab-inbound">
              <Inbox className="w-4 h-4 mr-2" />
              Eingehend
              {inboundTrades.length > 0 && (
                <Badge className="ml-2 bg-red-500">{inboundTrades.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outbound" className="data-[state=active]:bg-blue-600" data-testid="tab-outbound">
              <Send className="w-4 h-4 mr-2" />
              Ausgehend
              {outboundTrades.length > 0 && (
                <Badge className="ml-2 bg-amber-500">{outboundTrades.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-blue-600" data-testid="tab-completed">
              <CheckCircle className="w-4 h-4 mr-2" />
              Abgeschlossen
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Lade Trades...</div>
          ) : (
            <>
              <TabsContent value="inbound" className="space-y-3">
                {inboundTrades.length === 0 ? (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardContent className="p-8 text-center text-slate-400">
                      <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Keine eingehenden Trade-Anfragen</p>
                    </CardContent>
                  </Card>
                ) : (
                  inboundTrades.map(trade => (
                    <TradeCard key={trade.trade_id} trade={trade} type="inbound" />
                  ))
                )}
              </TabsContent>

              <TabsContent value="outbound" className="space-y-3">
                {outboundTrades.length === 0 ? (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardContent className="p-8 text-center text-slate-400">
                      <Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Keine ausgehenden Trade-Anfragen</p>
                    </CardContent>
                  </Card>
                ) : (
                  outboundTrades.map(trade => (
                    <TradeCard key={trade.trade_id} trade={trade} type="outbound" />
                  ))
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-3">
                {completedTrades.length === 0 ? (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardContent className="p-8 text-center text-slate-400">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Noch keine abgeschlossenen Trades</p>
                    </CardContent>
                  </Card>
                ) : (
                  completedTrades.map(trade => (
                    <TradeCard key={trade.trade_id} trade={trade} type="completed" />
                  ))
                )}
              </TabsContent>
            </>
          )}
        </Tabs>

        {/* New Trade Dialog */}
        <Dialog open={showNewTrade} onOpenChange={(open) => !open && resetNewTrade()}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-400" />
                {counterMode ? 'Gegenangebot erstellen' : 'Neuer Trade'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* User Search */}
              {!targetUser && !counterMode && (
                <div className="space-y-3">
                  <label className="text-sm text-slate-300">Handelspartner suchen</label>
                  <div className="flex gap-2">
                    <Input
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value)}
                      placeholder="Benutzername eingeben..."
                      className="bg-slate-800 border-slate-600"
                      onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                      data-testid="search-username-input"
                    />
                    <Button 
                      onClick={searchUser} 
                      disabled={searchLoading}
                      data-testid="search-user-btn"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Target User Found */}
              {targetUser && (
                <>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <User className="w-8 h-8 text-blue-400" />
                      <div>
                        <div className="font-medium text-white">{targetUser.username}</div>
                        <div className="text-xs text-slate-400">Level {targetUser.level || 1}</div>
                      </div>
                    </div>
                    {!counterMode && (
                      <Button variant="ghost" size="sm" onClick={() => setTargetUser(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Trade Interface */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* My Offer */}
                    <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                      <h3 className="font-semibold text-red-400 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Du bietest an ({selectedMyItems.length}/10)
                      </h3>
                      
                      <ItemSelector
                        items={myInventory}
                        selected={selectedMyItems}
                        onToggle={toggleMyItem}
                        title="Deine Items"
                        emptyText="Keine Items im Inventar"
                      />
                      
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-yellow-500" />
                          G anbieten
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={offeredG}
                          onChange={(e) => setOfferedG(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="bg-slate-800 border-slate-600"
                          data-testid="offered-g-input"
                        />
                        {offeredG > 0 && (
                          <p className="text-xs text-amber-400">
                            <AlertTriangle className="w-3 h-3 inline mr-1" />
                            30% Gebühr: {calculateFee(offeredG)} G (wird vernichtet)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Their Offer */}
                    <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                      <h3 className="font-semibold text-green-400 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Du möchtest ({selectedTheirItems.length}/10)
                      </h3>
                      
                      <ItemSelector
                        items={theirInventory}
                        selected={selectedTheirItems}
                        onToggle={toggleTheirItem}
                        title={`${targetUser.username}s Items`}
                        emptyText="Keine Items verfügbar"
                      />
                      
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-yellow-500" />
                          G anfragen
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={requestedG}
                          onChange={(e) => setRequestedG(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="bg-slate-800 border-slate-600"
                          data-testid="requested-g-input"
                        />
                        {requestedG > 0 && (
                          <p className="text-xs text-slate-400">
                            Der andere Spieler zahlt 30% Gebühr auf diesen Betrag
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <Card className="bg-slate-800/50 border-slate-600">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-white mb-3">Zusammenfassung</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-red-400">Du gibst:</span>
                          <ul className="mt-1 space-y-1 text-slate-300">
                            {selectedMyItems.map(i => <li key={i.inventory_id}>• {i.item_name}</li>)}
                            {offeredG > 0 && <li className="text-yellow-400">• {offeredG} G (+{calculateFee(offeredG)} G Gebühr)</li>}
                            {selectedMyItems.length === 0 && offeredG === 0 && <li className="text-slate-500">Nichts</li>}
                          </ul>
                        </div>
                        <div>
                          <span className="text-green-400">Du bekommst:</span>
                          <ul className="mt-1 space-y-1 text-slate-300">
                            {selectedTheirItems.map(i => <li key={i.inventory_id}>• {i.item_name}</li>)}
                            {requestedG > 0 && <li className="text-yellow-400">• {requestedG} G</li>}
                            {selectedTheirItems.length === 0 && requestedG === 0 && <li className="text-slate-500">Nichts</li>}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetNewTrade}>Abbrechen</Button>
              {targetUser && (
                <Button 
                  onClick={counterMode ? sendCounterOffer : createTrade}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={selectedMyItems.length === 0 && selectedTheirItems.length === 0 && offeredG === 0 && requestedG === 0}
                  data-testid="submit-trade-btn"
                >
                  {counterMode ? 'Gegenangebot senden' : 'Trade senden'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trade Detail Dialog */}
        <Dialog open={showTradeDetail} onOpenChange={setShowTradeDetail}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Trade Details</DialogTitle>
            </DialogHeader>

            {selectedTrade && (
              <div className="space-y-6">
                {/* Trade Parties */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Initiator</div>
                    <div className="font-medium text-white">{selectedTrade.initiator.username}</div>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Empfänger</div>
                    <div className="font-medium text-white">{selectedTrade.recipient.username}</div>
                  </div>
                </div>

                {/* Trade Content */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Initiator Offer */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-300">{selectedTrade.initiator.username} bietet:</h4>
                    <div className="p-3 bg-slate-800/30 rounded-lg space-y-2">
                      {selectedTrade.initiator.items.map(item => (
                        <div key={item.inventory_id} className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <span className="text-white text-sm">{item.item_name}</span>
                          <Badge variant="outline" className={`text-xs ${RARITY_COLORS[item.item_rarity]?.border}`}>
                            {item.item_rarity}
                          </Badge>
                        </div>
                      ))}
                      {selectedTrade.initiator.g_amount > 0 && (
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          <span className="text-yellow-400">{selectedTrade.initiator.g_amount} G</span>
                        </div>
                      )}
                      {selectedTrade.initiator.items.length === 0 && selectedTrade.initiator.g_amount === 0 && (
                        <span className="text-slate-500 text-sm">Nichts</span>
                      )}
                    </div>
                  </div>

                  {/* Recipient Offer */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-300">{selectedTrade.recipient.username} bietet:</h4>
                    <div className="p-3 bg-slate-800/30 rounded-lg space-y-2">
                      {selectedTrade.recipient.items.map(item => (
                        <div key={item.inventory_id} className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <span className="text-white text-sm">{item.item_name}</span>
                          <Badge variant="outline" className={`text-xs ${RARITY_COLORS[item.item_rarity]?.border}`}>
                            {item.item_rarity}
                          </Badge>
                        </div>
                      ))}
                      {selectedTrade.recipient.g_amount > 0 && (
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          <span className="text-yellow-400">{selectedTrade.recipient.g_amount} G</span>
                        </div>
                      )}
                      {selectedTrade.recipient.items.length === 0 && selectedTrade.recipient.g_amount === 0 && (
                        <span className="text-slate-500 text-sm">Nichts</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fee Info */}
                {(selectedTrade.initiator.g_amount > 0 || selectedTrade.recipient.g_amount > 0) && (
                  <Card className="bg-amber-900/20 border-amber-700">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>30% Gebühr auf G-Transfers (wird vernichtet)</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Timestamp */}
                <div className="text-xs text-slate-500">
                  Erstellt: {formatDate(selectedTrade.created_at)}
                  {selectedTrade.completed_at && (
                    <> | Abgeschlossen: {formatDate(selectedTrade.completed_at)}</>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2">
              {selectedTrade?.status === 'pending' && (
                <>
                  {/* Recipient Actions */}
                  {selectedTrade.recipient_id === user?.user_id && (
                    <>
                      <Button 
                        variant="destructive" 
                        onClick={() => rejectTrade(selectedTrade.trade_id)}
                        data-testid="reject-trade-btn"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Ablehnen
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => startCounterOffer(selectedTrade)}
                        data-testid="counter-trade-btn"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Gegenangebot
                      </Button>
                      <Button 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => acceptTrade(selectedTrade.trade_id)}
                        data-testid="accept-trade-btn"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Akzeptieren
                      </Button>
                    </>
                  )}
                  
                  {/* Initiator Actions */}
                  {selectedTrade.initiator_id === user?.user_id && (
                    <Button 
                      variant="destructive" 
                      onClick={() => cancelTrade(selectedTrade.trade_id)}
                      data-testid="cancel-trade-btn"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Abbrechen
                    </Button>
                  )}
                </>
              )}
              
              <Button variant="outline" onClick={() => setShowTradeDetail(false)}>
                Schließen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Trading;
