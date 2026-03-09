import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
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
  Search,
  Package,
  ArrowRight,
  Plus,
  Trash2,
  Loader2,
  Megaphone,
  User,
  Clock,
  X,
  Coins,
} from 'lucide-react';
import { formatCurrency } from '../lib/formatCurrency';

const RARITY_COLORS = {
  common:    { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.4)',  text: '#9CA3AF' },
  uncommon:  { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)',    text: '#22C55E' },
  rare:      { bg: 'rgba(59,130,246,0.15)',   border: 'rgba(59,130,246,0.4)',   text: '#3B82F6' },
  epic:      { bg: 'rgba(168,85,247,0.15)',   border: 'rgba(168,85,247,0.4)',   text: '#A855F7' },
  legendary: { bg: 'rgba(245,158,11,0.15)',   border: 'rgba(245,158,11,0.4)',   text: '#F59E0B' },
};

const tl = (key, lang) => {
  const translations = {
    tradeAds:        { de: 'Handelsanzeigen',            en: 'Trade Ads' },
    browse:          { de: 'Durchsuchen',                en: 'Browse' },
    myAds:           { de: 'Meine Anzeigen',             en: 'My Ads' },
    createAd:        { de: 'Anzeige erstellen',          en: 'Create Ad' },
    search:          { de: 'Anzeigen suchen...',          en: 'Search ads...' },
    offering:        { de: 'Bietet',                     en: 'Offering' },
    seeking:         { de: 'Sucht',                      en: 'Seeking' },
    noAds:           { de: 'Keine Anzeigen gefunden',    en: 'No ads found' },
    noMyAds:         { de: 'Du hast keine aktiven Anzeigen', en: 'You have no active ads' },
    delete:          { de: 'Löschen',                    en: 'Delete' },
    deleted:         { de: 'Anzeige gelöscht',           en: 'Ad deleted' },
    created:         { de: 'Anzeige erstellt!',          en: 'Ad created!' },
    cancel:          { de: 'Abbrechen',                  en: 'Cancel' },
    create:          { de: 'Erstellen',                  en: 'Create' },
    note:            { de: 'Notiz (optional)',            en: 'Note (optional)' },
    notePlaceholder: { de: 'z.B. "Suche dringend..."',  en: 'e.g. "Looking urgently..."' },
    noInventory:     { de: 'Keine Items im Inventar',    en: 'No items in inventory' },
    totalAds:        { de: 'Anzeigen',                   en: 'Ads' },
    addToOffer:      { de: '+ Zum Angebot',              en: '+ Add to Offer' },
    addToRequest:    { de: '+ Zur Anfrage',              en: '+ Add to Request' },
    yourInventory:   { de: 'Dein Inventar',              en: 'Your Inventory' },
    allItems:        { de: 'Alle Items',                 en: 'All Items' },
    searchInv:       { de: 'Inventar suchen...',         en: 'Search inventory...' },
    searchCatalog:   { de: 'Katalog suchen...',          en: 'Search catalog...' },
    value:           { de: 'Wert',                       en: 'Value' },
    includeG:        { de: '+ G hinzufügen',             en: '+ Include G' },
    needG:           { de: '+ G anfordern',              en: '+ Need G' },
    emptySlots:      { de: 'Klicke unten auf Items zum Hinzufügen', en: 'Click items below to add' },
    plusG:           { de: 'G',                          en: 'G' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

const timeAgo = (timestamp, lang) => {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return lang === 'de' ? 'gerade eben' : 'just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
};

const ItemChip = ({ item }) => {
  const colors = RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common;
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      <Package className="w-3 h-3" style={{ color: colors.text }} />
      <span className="text-white font-medium truncate max-w-[120px]">{item.item_name}</span>
    </div>
  );
};

// ─── Trade Ad Card ────────────────────────────
const TradeAdCard = ({ ad, isOwn, onDelete, lang }) => (
  <Card
    data-testid={`trade-ad-${ad.ad_id}`}
    className="bg-[#0A0A0C] border border-white/5 hover:border-white/15 transition-colors"
  >
    <CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-white/30" />
          <span className="text-white/70 text-sm font-medium">{ad.username}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/20 text-xs font-mono">
            <Clock className="w-3 h-3 inline mr-1" />
            {timeAgo(ad.created_at, lang)}
          </span>
          {isOwn && (
            <Button
              data-testid={`delete-ad-${ad.ad_id}`}
              variant="ghost"
              size="sm"
              onClick={() => onDelete(ad)}
              className="h-6 w-6 p-0 text-red-400/50 hover:text-red-400 hover:bg-red-400/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#00FF94] text-[10px] font-mono uppercase tracking-wider mb-1.5">
            {tl('offering', lang)}
          </p>
          <div className="flex flex-wrap gap-1">
            {ad.offering_items.map((item, i) => (
              <ItemChip key={i} item={item} />
            ))}
            {ad.offering_g > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs bg-amber-400/10 border-amber-400/30">
                <Coins className="w-3 h-3 text-amber-400" />
                <span className="text-amber-400 font-mono font-bold">{formatCurrency(ad.offering_g)} G</span>
              </div>
            )}
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-white/20 mt-5 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-[#FF6B6B] text-[10px] font-mono uppercase tracking-wider mb-1.5">
            {tl('seeking', lang)}
          </p>
          <div className="flex flex-wrap gap-1">
            {ad.seeking_items.map((item, i) => (
              <ItemChip key={i} item={item} />
            ))}
            {ad.seeking_g > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs bg-amber-400/10 border-amber-400/30">
                <Coins className="w-3 h-3 text-amber-400" />
                <span className="text-amber-400 font-mono font-bold">{formatCurrency(ad.seeking_g)} G</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {ad.note && (
        <p className="text-white/30 text-xs italic border-t border-white/5 pt-2">
          "{ad.note}"
        </p>
      )}
    </CardContent>
  </Card>
);

// ─── Slot Card (item in the top offer/seek grid) ────────────
const SlotCard = ({ item, onRemove }) => {
  const colors = RARITY_COLORS[item.item_rarity || item.rarity] || RARITY_COLORS.common;
  const imgUrl = item.item_image || item.image_url;
  const name = item.item_name || item.name || 'Unknown';
  return (
    <div
      className="relative w-[72px] h-[72px] rounded-xl border-2 flex flex-col items-center justify-center bg-black/60 flex-shrink-0 group cursor-default"
      style={{ borderColor: colors.border, background: colors.bg }}
      title={name}
    >
      {imgUrl ? (
        <img src={imgUrl} alt={name} className="w-10 h-10 object-contain" />
      ) : (
        <Package className="w-8 h-8" style={{ color: colors.text }} />
      )}
      <p className="text-[8px] text-white/60 truncate w-full text-center px-1 mt-0.5 leading-tight">{name}</p>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        <X className="w-2.5 h-2.5 text-white" />
      </button>
    </div>
  );
};

// ─── Item Picker Row (bottom panel) ──────────
const ItemPickerRow = ({ item, onAdd, disabled }) => {
  const colors = RARITY_COLORS[item.rarity || item.item_rarity] || RARITY_COLORS.common;
  const imgUrl = item.image_url || item.item_image;
  const name = item.name || item.item_name || 'Unknown';
  const rarity = item.rarity || item.item_rarity || 'common';
  return (
    <div
      onClick={disabled ? undefined : onAdd}
      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
        disabled
          ? 'border-white/5 bg-black/20 opacity-30 cursor-not-allowed'
          : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/5 cursor-pointer'
      }`}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={name} className="w-7 h-7 object-contain" />
        ) : (
          <Package className="w-4 h-4" style={{ color: colors.text }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">{name}</p>
        <p className="text-[10px] font-mono uppercase" style={{ color: colors.text }}>{rarity}</p>
      </div>
      {!disabled && <Plus className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />}
    </div>
  );
};

// ─── Main Trade Ads Component ────────────────
export default function TradeAds() {
  const { user, token } = useAuth();
  const { language } = useLanguage();
  const lang = language;

  const [ads, setAds] = useState([]);
  const [myAds, setMyAds] = useState([]);
  const [totalAds, setTotalAds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('browse');

  // Create dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [allItems, setAllItems] = useState([]);

  // Rolimons-style slot state
  const [offeringSlots, setOfferingSlots] = useState([]);
  const [seekingSlots, setSeekingSlots] = useState([]);
  const [offeringG, setOfferingG] = useState('');
  const [seekingG, setSeekingG] = useState('');
  const [note, setNote] = useState('');
  const [dialogTab, setDialogTab] = useState('offer'); // 'offer' | 'request'
  const [searchOffer, setSearchOffer] = useState('');
  const [searchRequest, setSearchRequest] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Value lookup map from catalog
  const itemValueMap = useMemo(() => {
    const map = {};
    for (const item of allItems) map[item.item_id] = item.value || 0;
    return map;
  }, [allItems]);

  const offeringTotal = useMemo(() =>
    offeringSlots.reduce((s, i) => s + (itemValueMap[i.item_id] || 0), 0) + (parseFloat(offeringG) || 0),
    [offeringSlots, offeringG, itemValueMap]
  );

  const seekingTotal = useMemo(() =>
    seekingSlots.reduce((s, i) => s + (itemValueMap[i.item_id] || 0), 0) + (parseFloat(seekingG) || 0),
    [seekingSlots, seekingG, itemValueMap]
  );

  const usedInventoryIds = useMemo(() => new Set(offeringSlots.map(i => i.inventory_id)), [offeringSlots]);

  const filteredInventory = useMemo(() => {
    const q = searchOffer.toLowerCase();
    return inventory.filter(i => !q || (i.item_name || i.name || '').toLowerCase().includes(q));
  }, [inventory, searchOffer]);

  const filteredCatalog = useMemo(() => {
    const q = searchRequest.toLowerCase();
    return allItems.filter(i => !q || (i.name || '').toLowerCase().includes(q));
  }, [allItems, searchRequest]);

  const loadAds = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/trade-ads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAds(data.ads);
        setTotalAds(data.total);
      }
    } catch (e) { console.error(e); }
  }, [search]);

  const loadMyAds = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/trade-ads/my', { headers });
      if (res.ok) {
        const data = await res.json();
        setMyAds(data.ads);
      }
    } catch (e) { console.error(e); }
  }, [token]);

  const loadCreateData = useCallback(async () => {
    if (!token) return;
    try {
      const [invRes, itemsRes] = await Promise.all([
        fetch('/api/inventory', { headers }),
        fetch('/api/items/catalog?limit=200'),
      ]);
      if (invRes.ok) {
        const data = await invRes.json();
        const expanded = [];
        for (const item of data.items) {
          if (item.item_id?.includes('chest') || item.category === 'chest') continue;
          const ids = item.inventory_ids?.length ? item.inventory_ids : [item.inventory_id];
          for (const inv_id of ids) {
            expanded.push({ ...item, inventory_id: inv_id });
          }
        }
        setInventory(expanded);
      }
      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setAllItems(data.items);
      }
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadAds(), loadMyAds()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => { loadAds(); }, [search]);

  useEffect(() => {
    if (createDialog) {
      loadCreateData();
      // Reset state on open
      setOfferingSlots([]);
      setSeekingSlots([]);
      setOfferingG('');
      setSeekingG('');
      setNote('');
      setDialogTab('offer');
      setSearchOffer('');
      setSearchRequest('');
    }
  }, [createDialog]);

  const addToOffering = (item) => {
    if (offeringSlots.length >= 10) return;
    setOfferingSlots(prev => [...prev, item]);
  };

  const addToSeeking = (item) => {
    if (seekingSlots.length >= 10) return;
    setSeekingSlots(prev => [...prev, item]);
  };

  const removeOffering = (idx) => setOfferingSlots(prev => prev.filter((_, i) => i !== idx));
  const removeSeeking = (idx) => setSeekingSlots(prev => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (offeringSlots.length === 0 || seekingSlots.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/trade-ads/create', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offering_inventory_ids: offeringSlots.map(i => i.inventory_id),
          seeking_item_ids: seekingSlots.map(i => i.item_id),
          offering_g: parseFloat(offeringG) || 0,
          seeking_g: parseFloat(seekingG) || 0,
          note,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(tl('created', lang));
        setCreateDialog(false);
        await Promise.all([loadAds(), loadMyAds()]);
      } else {
        toast.error(data.detail || 'Failed');
      }
    } catch (e) { toast.error('Network error'); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async (ad) => {
    try {
      const res = await fetch('/api/trade-ads/delete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: ad.ad_id }),
      });
      if (res.ok) {
        toast.success(tl('deleted', lang));
        await Promise.all([loadAds(), loadMyAds()]);
      }
    } catch (e) { toast.error('Network error'); }
  };

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1
              data-testid="trade-ads-title"
              className="text-3xl sm:text-4xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              <Megaphone className="w-8 h-8 inline-block mr-3 text-[#FF6B6B]" />
              {tl('tradeAds', lang)}
            </h1>
            <p className="text-white/40 text-sm mt-1 font-mono">
              {totalAds} {tl('totalAds', lang)}
            </p>
          </div>
          <Button
            data-testid="create-ad-btn"
            onClick={() => setCreateDialog(true)}
            className="bg-[#FF6B6B]/10 text-[#FF6B6B] border border-[#FF6B6B]/30 hover:bg-[#FF6B6B]/20 hover:shadow-[0_0_15px_rgba(255,107,107,0.3)] font-bold uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" />
            {tl('createAd', lang)}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-[#0A0A0C] border border-white/5">
            <TabsTrigger data-testid="tab-browse-ads" value="browse" className="data-[state=active]:bg-[#FF6B6B]/10 data-[state=active]:text-[#FF6B6B]">
              <Megaphone className="w-4 h-4 mr-2" /> {tl('browse', lang)}
            </TabsTrigger>
            <TabsTrigger data-testid="tab-my-ads" value="my-ads" className="data-[state=active]:bg-[#FFD700]/10 data-[state=active]:text-[#FFD700]">
              <User className="w-4 h-4 mr-2" /> {tl('myAds', lang)}
              {myAds.length > 0 && (
                <span className="ml-1 text-xs bg-[#FFD700]/20 text-[#FFD700] px-1.5 rounded-full">{myAds.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-6">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                data-testid="trade-ads-search"
                placeholder={tl('search', lang)}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-black/50 border-white/10 focus:border-[#FF6B6B] text-white placeholder:text-white/30"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF6B6B] animate-spin" />
              </div>
            ) : ads.length === 0 ? (
              <div className="text-center py-20">
                <Megaphone className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/30 font-mono">{tl('noAds', lang)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ads.map((ad) => (
                  <TradeAdCard key={ad.ad_id} ad={ad} isOwn={ad.user_id === user?.user_id} onDelete={handleDelete} lang={lang} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-ads" className="mt-6">
            {myAds.length === 0 ? (
              <div className="text-center py-20">
                <User className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/30 font-mono">{tl('noMyAds', lang)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myAds.map((ad) => (
                  <TradeAdCard key={ad.ad_id} ad={ad} isOwn={true} onDelete={handleDelete} lang={lang} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Create Trade Ad Dialog (Rolimons-style) ─── */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="bg-[#0A0A0C] border border-white/10 text-white max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle className="text-white flex items-center gap-2 text-lg">
              <Megaphone className="w-5 h-5 text-[#FF6B6B]" />
              {tl('createAd', lang)}
            </DialogTitle>
          </DialogHeader>

          {/* ── Top: Offering / Seeking Slots ── */}
          <div className="flex gap-0 border-b border-white/10 flex-shrink-0">
            {/* Offering Side */}
            <div className="flex-1 p-4 border-r border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#00FF94] text-xs font-mono uppercase tracking-wider font-bold">
                  {tl('offering', lang)} ({offeringSlots.length}/10)
                </span>
                {offeringTotal > 0 && (
                  <span className="text-amber-400 text-xs font-mono">
                    ≈ {formatCurrency(offeringTotal)} G
                  </span>
                )}
              </div>

              {/* Slots */}
              <div className="flex flex-wrap gap-2 min-h-[80px]">
                {offeringSlots.map((item, idx) => (
                  <SlotCard key={`${item.inventory_id}-${idx}`} item={item} onRemove={() => removeOffering(idx)} />
                ))}
                {offeringSlots.length === 0 && (
                  <div className="w-full flex items-center justify-center h-[72px] rounded-xl border-2 border-dashed border-white/10 text-white/20 text-xs font-mono">
                    {tl('emptySlots', lang)}
                  </div>
                )}
              </div>

              {/* G Input */}
              <div className="mt-3 flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                <Input
                  type="number"
                  placeholder={tl('includeG', lang)}
                  value={offeringG}
                  onChange={(e) => setOfferingG(e.target.value)}
                  min="0"
                  className="h-7 text-xs bg-black/50 border-white/10 focus:border-[#00FF94] text-white placeholder:text-white/20 font-mono"
                />
                <span className="text-white/30 text-xs font-mono">G</span>
              </div>
            </div>

            {/* Seeking Side */}
            <div className="flex-1 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#FF6B6B] text-xs font-mono uppercase tracking-wider font-bold">
                  {tl('seeking', lang)} ({seekingSlots.length}/10)
                </span>
                {seekingTotal > 0 && (
                  <span className="text-amber-400 text-xs font-mono">
                    ≈ {formatCurrency(seekingTotal)} G
                  </span>
                )}
              </div>

              {/* Slots */}
              <div className="flex flex-wrap gap-2 min-h-[80px]">
                {seekingSlots.map((item, idx) => (
                  <SlotCard key={`${item.item_id}-${idx}`} item={item} onRemove={() => removeSeeking(idx)} />
                ))}
                {seekingSlots.length === 0 && (
                  <div className="w-full flex items-center justify-center h-[72px] rounded-xl border-2 border-dashed border-white/10 text-white/20 text-xs font-mono">
                    {tl('emptySlots', lang)}
                  </div>
                )}
              </div>

              {/* G Input */}
              <div className="mt-3 flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                <Input
                  type="number"
                  placeholder={tl('needG', lang)}
                  value={seekingG}
                  onChange={(e) => setSeekingG(e.target.value)}
                  min="0"
                  className="h-7 text-xs bg-black/50 border-white/10 focus:border-[#FF6B6B] text-white placeholder:text-white/20 font-mono"
                />
                <span className="text-white/30 text-xs font-mono">G</span>
              </div>
            </div>
          </div>

          {/* ── Bottom: Item Picker Panel ── */}
          <div className="flex flex-col flex-1 min-h-0 px-4 pt-3 pb-0">
            <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="bg-black/50 border border-white/10 flex-shrink-0 w-full justify-start">
                <TabsTrigger
                  value="offer"
                  className="data-[state=active]:bg-[#00FF94]/10 data-[state=active]:text-[#00FF94] text-xs"
                >
                  {tl('addToOffer', lang)}
                  <span className="ml-1.5 text-[10px] opacity-50 font-mono">{tl('yourInventory', lang)}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="request"
                  className="data-[state=active]:bg-[#FF6B6B]/10 data-[state=active]:text-[#FF6B6B] text-xs"
                >
                  {tl('addToRequest', lang)}
                  <span className="ml-1.5 text-[10px] opacity-50 font-mono">{tl('allItems', lang)}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="offer" className="flex-1 min-h-0 flex flex-col mt-2">
                <div className="relative mb-2 flex-shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    placeholder={tl('searchInv', lang)}
                    value={searchOffer}
                    onChange={(e) => setSearchOffer(e.target.value)}
                    className="pl-8 h-8 text-xs bg-black/50 border-white/10 focus:border-[#00FF94] text-white placeholder:text-white/30"
                  />
                </div>
                <div className="overflow-y-auto flex-1 pr-1 space-y-1 pb-2">
                  {filteredInventory.length === 0 ? (
                    <p className="text-white/20 text-xs text-center py-6 font-mono">{tl('noInventory', lang)}</p>
                  ) : (
                    filteredInventory.map((item) => (
                      <ItemPickerRow
                        key={item.inventory_id}
                        item={item}
                        onAdd={() => addToOffering(item)}
                        disabled={usedInventoryIds.has(item.inventory_id) || offeringSlots.length >= 10}
                      />
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="request" className="flex-1 min-h-0 flex flex-col mt-2">
                <div className="relative mb-2 flex-shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    placeholder={tl('searchCatalog', lang)}
                    value={searchRequest}
                    onChange={(e) => setSearchRequest(e.target.value)}
                    className="pl-8 h-8 text-xs bg-black/50 border-white/10 focus:border-[#FF6B6B] text-white placeholder:text-white/30"
                  />
                </div>
                <div className="overflow-y-auto flex-1 pr-1 space-y-1 pb-2">
                  {filteredCatalog.map((item) => (
                    <ItemPickerRow
                      key={item.item_id}
                      item={item}
                      onAdd={() => addToSeeking(item)}
                      disabled={seekingSlots.length >= 10}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Note + Footer ── */}
          <div className="px-4 pb-4 pt-2 border-t border-white/5 flex-shrink-0 space-y-3">
            <Input
              data-testid="trade-ad-note"
              placeholder={tl('notePlaceholder', lang)}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="h-8 text-xs bg-black/50 border-white/10 focus:border-[#FF6B6B] text-white placeholder:text-white/30"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCreateDialog(false)}
                className="text-white/50 hover:text-white h-9 text-sm"
              >
                {tl('cancel', lang)}
              </Button>
              <Button
                data-testid="confirm-create-ad"
                onClick={handleCreate}
                disabled={offeringSlots.length === 0 || seekingSlots.length === 0 || actionLoading}
                className="bg-[#FF6B6B]/10 text-[#FF6B6B] border border-[#FF6B6B]/30 hover:bg-[#FF6B6B]/20 font-bold h-9 text-sm"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {tl('create', lang)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
