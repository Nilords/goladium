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

// Translations
const t = (key, lang) => {
  const translations = {
    // Headers & Buttons
    trading: { de: 'Trading', en: 'Trading' },
    newTrade: { de: 'Neuer Trade', en: 'New Trade' },
    inventoryAnalytics: { de: 'Inventar-Analyse', en: 'Inventory Analytics' },
    // Tabs
    inbound: { de: 'Eingehend', en: 'Inbound' },
    outbound: { de: 'Ausgehend', en: 'Outbound' },
    completed: { de: 'Abgeschlossen', en: 'Completed' },
    // Trade status
    counterOffer: { de: 'Gegenangebot', en: 'Counter Offer' },
    // Trade card labels
    youGive: { de: 'Du gibst:', en: 'You give:' },
    youReceive: { de: 'Du bekommst:', en: 'You receive:' },
    nothing: { de: 'Nichts', en: 'Nothing' },
    // Empty states
    noInbound: { de: 'Keine eingehenden Trade-Anfragen', en: 'No inbound trade requests' },
    noOutbound: { de: 'Keine ausgehenden Trade-Anfragen', en: 'No outbound trade requests' },
    noCompleted: { de: 'Noch keine abgeschlossenen Trades', en: 'No completed trades yet' },
    loadingTrades: { de: 'Lade Trades...', en: 'Loading trades...' },
    // Dialog titles
    createCounterOffer: { de: 'Gegenangebot erstellen', en: 'Create Counter Offer' },
    tradeDetails: { de: 'Trade Details', en: 'Trade Details' },
    // Search
    searchPartner: { de: 'Handelspartner suchen', en: 'Search trade partner' },
    enterUsername: { de: 'Benutzername eingeben...', en: 'Enter username...' },
    // Your offer
    youOffer: { de: 'Du bietest an', en: 'You offer' },
    yourItems: { de: 'Deine Items', en: 'Your items' },
    noItemsInventory: { de: 'Keine Items im Inventar', en: 'No items in inventory' },
    offerG: { de: 'G anbieten', en: 'Offer G' },
    feeWarning: { de: '30% Gebühr:', en: '30% Fee:' },
    feeDestroyed: { de: '(wird abgezogen)', en: '(will be gone)' },
    // You want
    youWant: { de: 'Du möchtest', en: 'You want' },
    theirItems: { de: 's Items', en: "'s items" },
    noItemsAvailable: { de: 'Keine Items verfügbar', en: 'No items available' },
    requestG: { de: 'G anfragen', en: 'Request G' },
    // Summary
    summary: { de: 'Zusammenfassung', en: 'Summary' },
    fee: { de: 'Gebühr', en: 'fee' },
    // Buttons
    cancel: { de: 'Abbrechen', en: 'Cancel' },
    sendCounterOffer: { de: 'Gegenangebot senden', en: 'Send Counter Offer' },
    sendTrade: { de: 'Trade senden', en: 'Send Trade' },
    reject: { de: 'Ablehnen', en: 'Reject' },
    accept: { de: 'Akzeptieren', en: 'Accept' },
    close: { de: 'Schließen', en: 'Close' },
    // Trade details
    initiator: { de: 'Initiator', en: 'Initiator' },
    recipient: { de: 'Empfänger', en: 'Recipient' },
    offers: { de: 'bietet:', en: 'offers:' },
    created: { de: 'Erstellt:', en: 'Created:' },
    completedAt: { de: 'Abgeschlossen:', en: 'Completed:' },
    // Toast messages
    errorLoadTrades: { de: 'Fehler beim Laden der Trades', en: 'Failed to load trades' },
    userNotFound: { de: 'Benutzer nicht gefunden', en: 'User not found' },
    searchError: { de: 'Fehler bei der Suche', en: 'Search error' },
    max10Items: { de: 'Maximal 10 Items pro Seite', en: 'Maximum 10 items per side' },
    tradeNeedsContent: { de: 'Trade muss mindestens ein Item oder G enthalten', en: 'Trade must contain at least one item or G' },
    tradeCreated: { de: 'Trade erfolgreich erstellt!', en: 'Trade created successfully!' },
    createError: { de: 'Fehler beim Erstellen des Trades', en: 'Failed to create trade' },
    counterSent: { de: 'Gegenangebot gesendet!', en: 'Counter offer sent!' },
    counterError: { de: 'Fehler beim Gegenangebot', en: 'Counter offer failed' },
    tradeComplete: { de: 'Trade abgeschlossen!', en: 'Trade completed!' },
    feeBurned: { de: 'G Gebühr verbrannt.', en: 'G fee burned.' },
    acceptError: { de: 'Fehler beim Akzeptieren', en: 'Failed to accept' },
    tradeRejected: { de: 'Trade abgelehnt', en: 'Trade rejected' },
    rejectError: { de: 'Fehler beim Ablehnen', en: 'Failed to reject' },
    tradeCancelled: { de: 'Trade abgebrochen', en: 'Trade cancelled' },
    cancelError: { de: 'Fehler beim Abbrechen', en: 'Failed to cancel' },
    level: { de: 'Level', en: 'Level' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

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
      toast.error(t('errorLoadTrades', language));
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
        toast.error(error.detail || t('userNotFound', language));
        return;
      }
      
      const userData = await response.json();
      setTargetUser(userData);
      
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
      toast.error(t('searchError', language));
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
      toast.error(t('max10Items', language));
    }
  };

  const toggleTheirItem = (item) => {
    if (selectedTheirItems.find(i => i.inventory_id === item.inventory_id)) {
      setSelectedTheirItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
    } else if (selectedTheirItems.length < 10) {
      setSelectedTheirItems(prev => [...prev, item]);
    } else {
      toast.error(t('max10Items', language));
    }
  };

  const createTrade = async () => {
    if (!targetUser) return;
    if (selectedMyItems.length === 0 && selectedTheirItems.length === 0 && offeredG === 0 && requestedG === 0) {
      toast.error(t('tradeNeedsContent', language));
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
        toast.error(error.detail || t('createError', language));
        return;
      }
      
      toast.success(t('tradeCreated', language));
      resetNewTrade();
      loadTrades();
      setActiveTab('outbound');
      
    } catch (error) {
      console.error('Create trade error:', error);
      toast.error(t('createError', language));
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
        toast.error(error.detail || t('counterError', language));
        return;
      }
      
      toast.success(t('counterSent', language));
      resetNewTrade();
      loadTrades();
      setActiveTab('outbound');
      
    } catch (error) {
      console.error('Counter error:', error);
      toast.error(t('counterError', language));
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
        toast.error(error.detail || t('acceptError', language));
        return;
      }
      
      const result = await response.json();
      toast.success(t('tradeComplete', language) + ' ' + (result.total_fee_burned > 0 ? `${result.total_fee_burned.toFixed(2)} ${t('feeBurned', language)}` : ''));
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Accept error:', error);
      toast.error(t('acceptError', language));
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
        toast.error(error.detail || t('rejectError', language));
        return;
      }
      
      toast.success(t('tradeRejected', language));
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Reject error:', error);
      toast.error(t('rejectError', language));
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
        toast.error(error.detail || t('cancelError', language));
        return;
      }
      
      toast.success(t('tradeCancelled', language));
      setShowTradeDetail(false);
      loadTrades();
      
    } catch (error) {
      console.error('Cancel error:', error);
      toast.error(t('cancelError', language));
    }
  };

  const startCounterOffer = async (trade) => {
    setCounterMode(true);
    setCounterTradeId(trade.trade_id);
    setShowTradeDetail(false);
    setShowNewTrade(true);
    
    setTargetUser({
      user_id: trade.initiator.user_id,
      username: trade.initiator.username
    });
    
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
    return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
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
                  {t('counterOffer', language)}
                </Badge>
              )}
            </div>
            <Badge 
              variant={isCompleted ? "default" : "outline"} 
              className={isCompleted ? "bg-green-600" : isInbound ? "border-blue-500 text-blue-400" : "border-amber-500 text-amber-400"}
            >
              {isCompleted ? t('completed', language) : isInbound ? t('inbound', language) : t('outbound', language)}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-red-400 text-xs">{t('youGive', language)}</span>
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
                  <span className="text-slate-500 text-xs">{t('nothing', language)}</span>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-green-400 text-xs">{t('youReceive', language)}</span>
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
                  <span className="text-slate-500 text-xs">{t('nothing', language)}</span>
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
              <h1 className="text-2xl font-bold text-white">{t('trading', language)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={goToInventoryAnalytics}
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                data-testid="inventory-analytics-btn"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {t('inventoryAnalytics', language)}
              </Button>
              <Button 
                onClick={() => setShowNewTrade(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="new-trade-btn"
              >
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                {t('newTrade', language)}
              </Button>
            </div>
          </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="inbound" className="data-[state=active]:bg-blue-600" data-testid="tab-inbound">
              <Inbox className="w-4 h-4 mr-2" />
              {t('inbound', language)}
              {inboundTrades.length > 0 && (
                <Badge className="ml-2 bg-red-500">{inboundTrades.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outbound" className="data-[state=active]:bg-blue-600" data-testid="tab-outbound">
              <Send className="w-4 h-4 mr-2" />
              {t('outbound', language)}
              {outboundTrades.length > 0 && (
                <Badge className="ml-2 bg-amber-500">{outboundTrades.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-blue-600" data-testid="tab-completed">
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('completed', language)}
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="text-center py-12 text-slate-400">{t('loadingTrades', language)}</div>
          ) : (
            <>
              <TabsContent value="inbound" className="space-y-3">
                {inboundTrades.length === 0 ? (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardContent className="p-8 text-center text-slate-400">
                      <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>{t('noInbound', language)}</p>
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
                      <p>{t('noOutbound', language)}</p>
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
                      <p>{t('noCompleted', language)}</p>
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
                {counterMode ? t('createCounterOffer', language) : t('newTrade', language)}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {!targetUser && !counterMode && (
                <div className="space-y-3">
                  <label className="text-sm text-slate-300">{t('searchPartner', language)}</label>
                  <div className="flex gap-2">
                    <Input
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value)}
                      placeholder={t('enterUsername', language)}
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

              {targetUser && (
                <>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <User className="w-8 h-8 text-blue-400" />
                      <div>
                        <div className="font-medium text-white">{targetUser.username}</div>
                        <div className="text-xs text-slate-400">{t('level', language)} {targetUser.level || 1}</div>
                      </div>
                    </div>
                    {!counterMode && (
                      <Button variant="ghost" size="sm" onClick={() => setTargetUser(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* My Offer */}
                    <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                      <h3 className="font-semibold text-red-400 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        {t('youOffer', language)} ({selectedMyItems.length}/10)
                      </h3>
                      
                      <ItemSelector
                        items={myInventory}
                        selected={selectedMyItems}
                        onToggle={toggleMyItem}
                        title={t('yourItems', language)}
                        emptyText={t('noItemsInventory', language)}
                      />
                      
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-yellow-500" />
                          {t('offerG', language)}
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
                            {t('feeWarning', language)} {calculateFee(offeredG)} G {t('feeDestroyed', language)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Their Offer */}
                    <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                      <h3 className="font-semibold text-green-400 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        {t('youWant', language)} ({selectedTheirItems.length}/10)
                      </h3>
                      
                      <ItemSelector
                        items={theirInventory}
                        selected={selectedTheirItems}
                        onToggle={toggleTheirItem}
                        title={`${targetUser.username}${t('theirItems', language)}`}
                        emptyText={t('noItemsAvailable', language)}
                      />
                      
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-yellow-500" />
                          {t('requestG', language)}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={requestedG}
                          onChange={(e) => setRequestedG(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="bg-slate-800 border-slate-600"
                          data-testid="requested-g-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <Card className="bg-slate-800/50 border-slate-600">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-white mb-3">{t('summary', language)}</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-red-400">{t('youGive', language)}</span>
                          <ul className="mt-1 space-y-1 text-slate-300">
                            {selectedMyItems.map(i => <li key={i.inventory_id}>• {i.item_name}</li>)}
                            {offeredG > 0 && <li className="text-yellow-400">{offeredG} G</li>}
                            {selectedMyItems.length === 0 && offeredG === 0 && <li className="text-slate-500">{t('nothing', language)}</li>}
                          </ul>
                        </div>
                        <div>
                          <span className="text-green-400">{t('youReceive', language)}</span>
                          <ul className="mt-1 space-y-1 text-slate-300">
                            {selectedTheirItems.map(i => <li key={i.inventory_id}>• {i.item_name}</li>)}
                            {requestedG > 0 && <li className="text-yellow-400">• {requestedG} G</li>}
                            {selectedTheirItems.length === 0 && requestedG === 0 && <li className="text-slate-500">{t('nothing', language)}</li>}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetNewTrade}>{t('cancel', language)}</Button>
              {targetUser && (
                <Button 
                  onClick={counterMode ? sendCounterOffer : createTrade}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={selectedMyItems.length === 0 && selectedTheirItems.length === 0 && offeredG === 0 && requestedG === 0}
                  data-testid="submit-trade-btn"
                >
                  {counterMode ? t('sendCounterOffer', language) : t('sendTrade', language)}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trade Detail Dialog */}
        <Dialog open={showTradeDetail} onOpenChange={setShowTradeDetail}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">{t('tradeDetails', language)}</DialogTitle>
            </DialogHeader>

            {selectedTrade && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">{t('initiator', language)}</div>
                    <div className="font-medium text-white">{selectedTrade.initiator.username}</div>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">{t('recipient', language)}</div>
                    <div className="font-medium text-white">{selectedTrade.recipient.username}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-300">{selectedTrade.initiator.username} {t('offers', language)}</h4>
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
                        <span className="text-slate-500 text-sm">{t('nothing', language)}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-300">{selectedTrade.recipient.username} {t('offers', language)}</h4>
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
                        <span className="text-slate-500 text-sm">{t('nothing', language)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {(selectedTrade.initiator.g_amount > 0 || selectedTrade.recipient.g_amount > 0) && (
                  <Card className="bg-amber-900/20 border-amber-700">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>
                          {language === "de"
                            ? "Der Spieler, der G sendet, zahlt zusätzlich eine 30% Handelsgebühr."
                            : "The player sending G pays an additional 30% trading fee."}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="text-xs text-slate-500">
                  {t('created', language)} {formatDate(selectedTrade.created_at)}
                  {selectedTrade.completed_at && (
                    <> | {t('completedAt', language)} {formatDate(selectedTrade.completed_at)}</>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2">
              {selectedTrade?.status === 'pending' && (
                <>
                  {selectedTrade.recipient_id === user?.user_id && (
                    <>
                      <Button 
                        variant="destructive" 
                        onClick={() => rejectTrade(selectedTrade.trade_id)}
                        data-testid="reject-trade-btn"
                      >
                        <X className="w-4 h-4 mr-2" />
                        {t('reject', language)}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => startCounterOffer(selectedTrade)}
                        data-testid="counter-trade-btn"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {t('counterOffer', language)}
                      </Button>
                      <Button 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => acceptTrade(selectedTrade.trade_id)}
                        data-testid="accept-trade-btn"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {t('accept', language)}
                      </Button>
                    </>
                  )}
                  
                  {selectedTrade.initiator_id === user?.user_id && (
                    <Button 
                      variant="destructive" 
                      onClick={() => cancelTrade(selectedTrade.trade_id)}
                      data-testid="cancel-trade-btn"
                    >
                      <X className="w-4 h-4 mr-2" />
                      {t('cancel', language)}
                    </Button>
                  )}
                </>
              )}
              
              <Button variant="outline" onClick={() => setShowTradeDetail(false)}>
                {t('close', language)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Trading;
