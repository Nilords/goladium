import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Store,
  Search,
  TrendingUp,
  ArrowUpDown,
  Tag,
  Package,
  Coins,
  X,
  ShoppingCart,
  Clock,
  Filter,
  ChevronDown,
  BarChart3,
  Minus,
  Plus,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

const RARITY_COLORS = {
  common: { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.4)', text: '#9CA3AF' },
  uncommon: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', text: '#22C55E' },
  rare: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#3B82F6' },
  epic: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)', text: '#A855F7' },
  legendary: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B' },
};

const t = (key, lang) => {
  const translations = {
    marketplace: { de: 'Marktplatz', en: 'Marketplace' },
    browse: { de: 'Durchsuchen', en: 'Browse' },
    myListings: { de: 'Meine Angebote', en: 'My Listings' },
    sellItems: { de: 'Item verkaufen', en: 'Sell Item' },
    searchItems: { de: 'Items suchen...', en: 'Search items...' },
    newest: { de: 'Neueste', en: 'Newest' },
    priceAsc: { de: 'Preis aufsteigend', en: 'Price: Low to High' },
    priceDesc: { de: 'Preis absteigend', en: 'Price: High to Low' },
    rarity: { de: 'Seltenheit', en: 'Rarity' },
    all: { de: 'Alle', en: 'All' },
    common: { de: 'Common', en: 'Common' },
    uncommon: { de: 'Uncommon', en: 'Uncommon' },
    rare: { de: 'Rare', en: 'Rare' },
    epic: { de: 'Epic', en: 'Epic' },
    legendary: { de: 'Legendary', en: 'Legendary' },
    buy: { de: 'Kaufen', en: 'Buy' },
    delist: { de: 'Entfernen', en: 'Delist' },
    listItem: { de: 'Item listen', en: 'List Item' },
    price: { de: 'Preis', en: 'Price' },
    seller: { de: 'Verkäufer', en: 'Seller' },
    rap: { de: 'RAP', en: 'RAP' },
    noListings: { de: 'Keine Angebote gefunden', en: 'No listings found' },
    noMyListings: { de: 'Du hast keine aktiven Angebote', en: 'You have no active listings' },
    confirmBuy: { de: 'Kauf bestätigen', en: 'Confirm Purchase' },
    confirmBuyMsg: { de: 'Möchtest du dieses Item kaufen?', en: 'Do you want to buy this item?' },
    fee: { de: 'Gebühr', en: 'Fee' },
    sellerReceives: { de: 'Verkäufer erhält', en: 'Seller receives' },
    cancel: { de: 'Abbrechen', en: 'Cancel' },
    selectItem: { de: 'Item zum Verkaufen wählen', en: 'Select item to sell' },
    setPrice: { de: 'Preis festlegen (G)', en: 'Set price (G)' },
    list: { de: 'Listen', en: 'List' },
    noInventory: { de: 'Keine verkaufbaren Items im Inventar', en: 'No sellable items in inventory' },
    bought: { de: 'Erfolgreich gekauft!', en: 'Successfully purchased!' },
    listed: { de: 'Erfolgreich gelistet!', en: 'Successfully listed!' },
    delisted: { de: 'Angebot entfernt!', en: 'Listing removed!' },
    loading: { de: 'Lade...', en: 'Loading...' },
    recentSales: { de: 'Letzte Verkäufe', en: 'Recent Sales' },
    totalListings: { de: 'Angebote', en: 'Listings' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

const RarityBadge = ({ rarity }) => {
  const colors = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  return (
    <Badge
      data-testid={`rarity-badge-${rarity}`}
      className="text-xs font-mono uppercase tracking-wider border"
      style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
    >
      {rarity}
    </Badge>
  );
};

// ─── Listing Card ────────────────────────────────────────────
const ListingCard = ({ listing, isOwn, onBuy, onDelist, lang }) => {
  const colors = RARITY_COLORS[listing.item_rarity] || RARITY_COLORS.common;

  return (
    <Card
      data-testid={`listing-card-${listing.listing_id}`}
      className="group bg-[#0A0A0C] border border-white/5 hover:border-white/20 transition-colors duration-300 overflow-hidden"
    >
      {/* Item Image / Placeholder */}
      <div
        className="h-32 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${colors.bg}, transparent)` }}
      >
        {listing.item_image ? (
          <img src={listing.item_image} alt={listing.item_name} className="h-24 w-24 object-contain" />
        ) : (
          <Package className="w-12 h-12" style={{ color: colors.text, opacity: 0.6 }} />
        )}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono font-bold"
          style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
        >
          {listing.item_rarity?.toUpperCase()}
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        <p className="text-white font-semibold text-sm truncate" title={listing.item_name}>
          {listing.item_name}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-[#FFD700] font-mono font-bold text-lg">
            {formatCurrency(listing.price)} G
          </span>
          {listing.rap > 0 && (
            <span className="text-white/40 text-xs font-mono flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              RAP {formatCurrency(listing.rap)}
            </span>
          )}
        </div>

        <p className="text-white/30 text-xs truncate">
          {t('seller', lang)}: {listing.seller_username}
        </p>

        {isOwn ? (
          <Button
            data-testid={`delist-btn-${listing.listing_id}`}
            variant="outline"
            size="sm"
            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 text-xs"
            onClick={() => onDelist(listing)}
          >
            <X className="w-3 h-3 mr-1" />
            {t('delist', lang)}
          </Button>
        ) : (
          <Button
            data-testid={`buy-btn-${listing.listing_id}`}
            size="sm"
            className="w-full bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-[#00F0FF]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.3)] text-xs font-bold uppercase tracking-wider"
            onClick={() => onBuy(listing)}
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            {t('buy', lang)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Inventory Item Card for Sell Dialog ─────────────────────
const InventorySelectCard = ({ item, selected, onSelect }) => {
  const colors = RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common;
  const isSelected = selected?.inventory_id === item.inventory_id;

  return (
    <div
      data-testid={`inv-select-${item.inventory_id}`}
      className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'border-[#00F0FF]/60 bg-[#00F0FF]/10'
          : 'border-white/5 bg-[#0A0A0C] hover:border-white/20'
      }`}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: colors.bg }}
        >
          {item.item_image ? (
            <img src={item.item_image} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <Package className="w-5 h-5" style={{ color: colors.text }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{item.item_name}</p>
          <div className="flex items-center gap-2">
            <RarityBadge rarity={item.item_rarity} />
            {item.stack_count > 1 && (
              <span className="text-white/40 text-xs">x{item.stack_count}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Marketplace Component ──────────────────────────────
export default function Marketplace() {
  const { user, token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const lang = language;

  // State
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalListings, setTotalListings] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [rarityFilter, setRarityFilter] = useState('all');

  // Dialogs
  const [buyDialog, setBuyDialog] = useState(null);
  const [sellDialog, setSellDialog] = useState(false);
  const [selectedInvItem, setSelectedInvItem] = useState(null);
  const [listPrice, setListPrice] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState('browse');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // ─── Data Loading ────────────────────────────
  const loadListings = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort: sortBy, limit: '100', offset: '0' });
      if (rarityFilter !== 'all') params.set('rarity', rarityFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/marketplace/listings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings);
        setTotalListings(data.total);
      }
    } catch (e) {
      console.error('Failed to load listings:', e);
    }
  }, [sortBy, rarityFilter, search]);

  const loadMyListings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/marketplace/my-listings', { headers });
      if (res.ok) {
        const data = await res.json();
        setMyListings(data.listings);
      }
    } catch (e) {
      console.error('Failed to load my listings:', e);
    }
  }, [token]);

  const loadInventory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/inventory', { headers });
      if (res.ok) {
        const data = await res.json();
        // Filter out chests and items already listed
        const listedInvIds = new Set(myListings.map((l) => l.inventory_id));
        const sellable = data.items.filter(
          (item) =>
            !item.item_id?.includes('chest') &&
            item.category !== 'chest' &&
            !listedInvIds.has(item.inventory_id)
        );
        setInventory(sellable);
      }
    } catch (e) {
      console.error('Failed to load inventory:', e);
    }
  }, [token, myListings]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadListings();
      await loadMyListings();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    loadListings();
  }, [sortBy, rarityFilter, search]);

  useEffect(() => {
    if (sellDialog) loadInventory();
  }, [sellDialog, myListings]);

  // ─── Actions ─────────────────────────────────
  const handleBuy = async () => {
    if (!buyDialog) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/marketplace/buy', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: buyDialog.listing_id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${t('bought', lang)} ${buyDialog.item_name} - ${formatCurrency(buyDialog.price)} G`);
        setBuyDialog(null);
        await refreshUser();
        await loadListings();
        await loadMyListings();
      } else {
        toast.error(data.detail || 'Purchase failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleList = async () => {
    if (!selectedInvItem || !listPrice) return;
    const price = parseFloat(listPrice);
    if (isNaN(price) || price <= 0) {
      toast.error(lang === 'de' ? 'Ungültiger Preis' : 'Invalid price');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/marketplace/list', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_id: selectedInvItem.inventory_id, price }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('listed', lang));
        setSellDialog(false);
        setSelectedInvItem(null);
        setListPrice('');
        await loadListings();
        await loadMyListings();
      } else {
        toast.error(data.detail || 'Listing failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelist = async (listing) => {
    try {
      const res = await fetch('/api/marketplace/delist', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.listing_id }),
      });
      if (res.ok) {
        toast.success(t('delisted', lang));
        await loadListings();
        await loadMyListings();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Delist failed');
      }
    } catch (e) {
      toast.error('Network error');
    }
  };

  // ─── Render ──────────────────────────────────
  const feePercent = 30;
  const priceNum = parseFloat(listPrice) || 0;
  const feeAmount = Math.round(priceNum * feePercent) / 100;
  const sellerReceives = Math.round((priceNum - feeAmount) * 100) / 100;

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1
              data-testid="marketplace-title"
              className="text-3xl sm:text-4xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              <Store className="w-8 h-8 inline-block mr-3 text-[#00F0FF]" />
              {t('marketplace', lang)}
            </h1>
            <p className="text-white/40 text-sm mt-1 font-mono">
              {totalListings} {t('totalListings', lang)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="text-right mr-2">
                <p className="text-white/40 text-xs">Balance</p>
                <p className="text-[#FFD700] font-mono font-bold text-lg">
                  {formatCurrency(user.balance)} G
                </p>
              </div>
            )}
            <Button
              data-testid="sell-item-btn"
              onClick={() => setSellDialog(true)}
              className="bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 hover:bg-[#FFD700]/20 hover:shadow-[0_0_15px_rgba(255,215,0,0.3)] font-bold uppercase tracking-wider"
            >
              <Tag className="w-4 h-4 mr-2" />
              {t('sellItems', lang)}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-[#0A0A0C] border border-white/5">
            <TabsTrigger
              data-testid="tab-browse"
              value="browse"
              className="data-[state=active]:bg-[#00F0FF]/10 data-[state=active]:text-[#00F0FF]"
            >
              <Store className="w-4 h-4 mr-2" />
              {t('browse', lang)}
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-my-listings"
              value="my-listings"
              className="data-[state=active]:bg-[#FFD700]/10 data-[state=active]:text-[#FFD700]"
            >
              <Package className="w-4 h-4 mr-2" />
              {t('myListings', lang)}
              {myListings.length > 0 && (
                <span className="ml-1 text-xs bg-[#FFD700]/20 text-[#FFD700] px-1.5 rounded-full">
                  {myListings.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="mt-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input
                  data-testid="marketplace-search"
                  placeholder={t('searchItems', lang)}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-black/50 border-white/10 focus:border-[#00F0FF] text-white placeholder:text-white/30"
                />
              </div>

              <div className="flex gap-2">
                <select
                  data-testid="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:border-[#00F0FF] outline-none"
                >
                  <option value="newest">{t('newest', lang)}</option>
                  <option value="price_asc">{t('priceAsc', lang)}</option>
                  <option value="price_desc">{t('priceDesc', lang)}</option>
                  <option value="rarity">{t('rarity', lang)}</option>
                </select>

                <select
                  data-testid="rarity-filter"
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:border-[#00F0FF] outline-none"
                >
                  <option value="all">{t('all', lang)}</option>
                  <option value="common">{t('common', lang)}</option>
                  <option value="uncommon">{t('uncommon', lang)}</option>
                  <option value="rare">{t('rare', lang)}</option>
                  <option value="epic">{t('epic', lang)}</option>
                  <option value="legendary">{t('legendary', lang)}</option>
                </select>
              </div>
            </div>

            {/* Listings Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#00F0FF] animate-spin" />
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-20">
                <Store className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/30 font-mono">{t('noListings', lang)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.listing_id}
                    listing={listing}
                    isOwn={listing.seller_id === user?.user_id}
                    onBuy={setBuyDialog}
                    onDelist={handleDelist}
                    lang={lang}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Listings Tab */}
          <TabsContent value="my-listings" className="mt-6">
            {myListings.length === 0 ? (
              <div className="text-center py-20">
                <Package className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/30 font-mono">{t('noMyListings', lang)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {myListings.map((listing) => (
                  <ListingCard
                    key={listing.listing_id}
                    listing={listing}
                    isOwn={true}
                    onBuy={() => {}}
                    onDelist={handleDelist}
                    lang={lang}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Buy Confirmation Dialog ─────────────────── */}
      <Dialog open={!!buyDialog} onOpenChange={() => setBuyDialog(null)}>
        <DialogContent className="bg-[#0A0A0C] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#00F0FF]" />
              {t('confirmBuy', lang)}
            </DialogTitle>
          </DialogHeader>

          {buyDialog && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4 p-3 bg-black/40 rounded-lg border border-white/5">
                <div
                  className="w-14 h-14 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: RARITY_COLORS[buyDialog.item_rarity]?.bg }}
                >
                  <Package className="w-7 h-7" style={{ color: RARITY_COLORS[buyDialog.item_rarity]?.text }} />
                </div>
                <div>
                  <p className="text-white font-semibold">{buyDialog.item_name}</p>
                  <RarityBadge rarity={buyDialog.item_rarity} />
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/50">{t('price', lang)}</span>
                  <span className="text-[#FFD700] font-mono font-bold">{formatCurrency(buyDialog.price)} G</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">{t('seller', lang)}</span>
                  <span className="text-white/70">{buyDialog.seller_username}</span>
                </div>
                {user && (
                  <div className="flex justify-between pt-2 border-t border-white/5">
                    <span className="text-white/50">Balance</span>
                    <span
                      className={`font-mono font-bold ${
                        user.balance >= buyDialog.price ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {formatCurrency(user.balance)} G
                    </span>
                  </div>
                )}
                {user && user.balance < buyDialog.price && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {lang === 'de' ? 'Nicht genug G' : 'Insufficient G'}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setBuyDialog(null)}
              className="text-white/50 hover:text-white"
            >
              {t('cancel', lang)}
            </Button>
            <Button
              data-testid="confirm-buy-btn"
              onClick={handleBuy}
              disabled={actionLoading || (user && buyDialog && user.balance < buyDialog.price)}
              className="bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-[#00F0FF]/20 font-bold"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
              {t('buy', lang)} - {buyDialog && formatCurrency(buyDialog.price)} G
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Sell / List Item Dialog ─────────────────── */}
      <Dialog open={sellDialog} onOpenChange={setSellDialog}>
        <DialogContent className="bg-[#0A0A0C] border border-white/10 text-white max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#FFD700]" />
              {t('sellItems', lang)}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Step 1: Select Item */}
            <div>
              <p className="text-white/50 text-sm mb-2">{t('selectItem', lang)}</p>
              {inventory.length === 0 ? (
                <p className="text-white/20 text-sm font-mono py-4 text-center">{t('noInventory', lang)}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {inventory.map((item) => (
                    <InventorySelectCard
                      key={item.inventory_id}
                      item={item}
                      selected={selectedInvItem}
                      onSelect={setSelectedInvItem}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Set Price */}
            {selectedInvItem && (
              <div className="space-y-3 pt-2 border-t border-white/5">
                <p className="text-white/50 text-sm">{t('setPrice', lang)}</p>
                <Input
                  data-testid="list-price-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  className="bg-black/50 border-white/10 focus:border-[#FFD700] text-[#FFD700] font-mono text-lg placeholder:text-white/20"
                />

                {priceNum > 0 && (
                  <div className="space-y-1 text-sm bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between">
                      <span className="text-white/40">{t('price', lang)}</span>
                      <span className="text-white font-mono">{formatCurrency(priceNum)} G</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">{t('fee', lang)} ({feePercent}%)</span>
                      <span className="text-red-400 font-mono">-{formatCurrency(feeAmount)} G</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-white/5">
                      <span className="text-white/60">{t('sellerReceives', lang)}</span>
                      <span className="text-[#00FF94] font-mono font-bold">{formatCurrency(sellerReceives)} G</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" onClick={() => { setSellDialog(false); setSelectedInvItem(null); setListPrice(''); }} className="text-white/50">
              {t('cancel', lang)}
            </Button>
            <Button
              data-testid="confirm-list-btn"
              onClick={handleList}
              disabled={!selectedInvItem || !listPrice || priceNum <= 0 || actionLoading}
              className="bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 hover:bg-[#FFD700]/20 font-bold"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Tag className="w-4 h-4 mr-2" />}
              {t('list', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
