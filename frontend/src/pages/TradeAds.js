import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
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
  Search,
  Package,
  ArrowLeftRight,
  ArrowRight,
  Plus,
  Trash2,
  Loader2,
  Megaphone,
  User,
  Clock,
  X,
  Check,
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
    tradeAds: { de: 'Handelsanzeigen', en: 'Trade Ads' },
    browse: { de: 'Durchsuchen', en: 'Browse' },
    myAds: { de: 'Meine Anzeigen', en: 'My Ads' },
    createAd: { de: 'Anzeige erstellen', en: 'Create Ad' },
    search: { de: 'Anzeigen suchen...', en: 'Search ads...' },
    offering: { de: 'Bietet', en: 'Offering' },
    seeking: { de: 'Sucht', en: 'Seeking' },
    noAds: { de: 'Keine Anzeigen gefunden', en: 'No ads found' },
    noMyAds: { de: 'Du hast keine aktiven Anzeigen', en: 'You have no active ads' },
    delete: { de: 'Löschen', en: 'Delete' },
    deleted: { de: 'Anzeige gelöscht', en: 'Ad deleted' },
    created: { de: 'Anzeige erstellt!', en: 'Ad created!' },
    cancel: { de: 'Abbrechen', en: 'Cancel' },
    create: { de: 'Erstellen', en: 'Create' },
    selectOffering: { de: 'Items zum Anbieten wählen', en: 'Select items to offer' },
    selectSeeking: { de: 'Gesuchte Items wählen', en: 'Select items you seek' },
    note: { de: 'Notiz (optional)', en: 'Note (optional)' },
    notePlaceholder: { de: 'z.B. "Suche dringend..."', en: 'e.g. "Looking urgently..."' },
    noInventory: { de: 'Keine Items im Inventar', en: 'No items in inventory' },
    totalAds: { de: 'Anzeigen', en: 'Ads' },
    step1: { de: '1. Was bietest du an?', en: '1. What are you offering?' },
    step2: { de: '2. Was suchst du?', en: '2. What are you looking for?' },
    step3: { de: '3. Notiz', en: '3. Note' },
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
      {/* Header: User + Time */}
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

      {/* Offering → Seeking */}
      <div className="flex items-start gap-3">
        {/* Offering */}
        <div className="flex-1 min-w-0">
          <p className="text-[#00FF94] text-[10px] font-mono uppercase tracking-wider mb-1.5">
            {t('offering', lang)}
          </p>
          <div className="flex flex-wrap gap-1">
            {ad.offering_items.map((item, i) => (
              <ItemChip key={i} item={item} />
            ))}
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-white/20 mt-5 flex-shrink-0" />

        {/* Seeking */}
        <div className="flex-1 min-w-0">
          <p className="text-[#FF6B6B] text-[10px] font-mono uppercase tracking-wider mb-1.5">
            {t('seeking', lang)}
          </p>
          <div className="flex flex-wrap gap-1">
            {ad.seeking_items.map((item, i) => (
              <ItemChip key={i} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Note */}
      {ad.note && (
        <p className="text-white/30 text-xs italic border-t border-white/5 pt-2">
          "{ad.note}"
        </p>
      )}
    </CardContent>
  </Card>
);

// ─── Selectable Item for Dialog ──────────────
const SelectableItem = ({ item, selected, onToggle, type }) => {
  const colors = RARITY_COLORS[item.rarity || item.item_rarity] || RARITY_COLORS.common;
  const id = type === 'inv' ? item.inventory_id : item.item_id;
  const isSelected = selected.has(id);

  return (
    <div
      data-testid={`select-${type}-${id}`}
      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-[#00F0FF]/50 bg-[#00F0FF]/10'
          : 'border-white/5 bg-black/30 hover:border-white/15'
      }`}
      onClick={() => onToggle(id)}
    >
      <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: colors.bg }}>
        <Package className="w-3.5 h-3.5" style={{ color: colors.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">
          {item.item_name || item.name}
        </p>
        <span className="text-[10px] font-mono uppercase" style={{ color: colors.text }}>
          {item.rarity || item.item_rarity}
        </span>
      </div>
      {isSelected && <Check className="w-4 h-4 text-[#00F0FF] flex-shrink-0" />}
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
  const [selectedOffering, setSelectedOffering] = useState(new Set());
  const [selectedSeeking, setSelectedSeeking] = useState(new Set());
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

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
        setInventory(data.items.filter(i => !i.item_id?.includes('chest') && i.category !== 'chest'));
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
    if (createDialog) loadCreateData();
  }, [createDialog]);

  const toggleOffering = (id) => {
    setSelectedOffering(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 8) next.add(id);
      return next;
    });
  };

  const toggleSeeking = (id) => {
    setSelectedSeeking(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 8) next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selectedOffering.size === 0 || selectedSeeking.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/trade-ads/create', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offering_inventory_ids: [...selectedOffering],
          seeking_item_ids: [...selectedSeeking],
          note,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('created', lang));
        setCreateDialog(false);
        setSelectedOffering(new Set());
        setSelectedSeeking(new Set());
        setNote('');
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
        toast.success(t('deleted', lang));
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
              {t('tradeAds', lang)}
            </h1>
            <p className="text-white/40 text-sm mt-1 font-mono">
              {totalAds} {t('totalAds', lang)}
            </p>
          </div>
          <Button
            data-testid="create-ad-btn"
            onClick={() => setCreateDialog(true)}
            className="bg-[#FF6B6B]/10 text-[#FF6B6B] border border-[#FF6B6B]/30 hover:bg-[#FF6B6B]/20 hover:shadow-[0_0_15px_rgba(255,107,107,0.3)] font-bold uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('createAd', lang)}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-[#0A0A0C] border border-white/5">
            <TabsTrigger data-testid="tab-browse-ads" value="browse" className="data-[state=active]:bg-[#FF6B6B]/10 data-[state=active]:text-[#FF6B6B]">
              <Megaphone className="w-4 h-4 mr-2" /> {t('browse', lang)}
            </TabsTrigger>
            <TabsTrigger data-testid="tab-my-ads" value="my-ads" className="data-[state=active]:bg-[#FFD700]/10 data-[state=active]:text-[#FFD700]">
              <User className="w-4 h-4 mr-2" /> {t('myAds', lang)}
              {myAds.length > 0 && <span className="ml-1 text-xs bg-[#FFD700]/20 text-[#FFD700] px-1.5 rounded-full">{myAds.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-6">
            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                data-testid="trade-ads-search"
                placeholder={t('search', lang)}
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
                <p className="text-white/30 font-mono">{t('noAds', lang)}</p>
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
                <p className="text-white/30 font-mono">{t('noMyAds', lang)}</p>
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

      {/* ─── Create Trade Ad Dialog ────────────────── */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="bg-[#0A0A0C] border border-white/10 text-white max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#FF6B6B]" />
              {t('createAd', lang)}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2">
            {/* Step 1: Offering */}
            <div>
              <p className="text-[#00FF94] text-sm font-mono mb-2">
                {t('step1', lang)} <span className="text-white/30">({selectedOffering.size}/8)</span>
              </p>
              {inventory.length === 0 ? (
                <p className="text-white/20 text-xs py-4 text-center font-mono">{t('noInventory', lang)}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {inventory.map((item) => (
                    <SelectableItem
                      key={item.inventory_id}
                      item={item}
                      selected={selectedOffering}
                      onToggle={toggleOffering}
                      type="inv"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Seeking */}
            <div>
              <p className="text-[#FF6B6B] text-sm font-mono mb-2">
                {t('step2', lang)} <span className="text-white/30">({selectedSeeking.size}/8)</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {allItems.map((item) => (
                  <SelectableItem
                    key={item.item_id}
                    item={item}
                    selected={selectedSeeking}
                    onToggle={toggleSeeking}
                    type="item"
                  />
                ))}
              </div>
            </div>

            {/* Step 3: Note */}
            <div>
              <p className="text-white/50 text-sm font-mono mb-2">{t('step3', lang)}</p>
              <Input
                data-testid="trade-ad-note"
                placeholder={t('notePlaceholder', lang)}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                className="bg-black/50 border-white/10 focus:border-[#FF6B6B] text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" onClick={() => setCreateDialog(false)} className="text-white/50">{t('cancel', lang)}</Button>
            <Button
              data-testid="confirm-create-ad"
              onClick={handleCreate}
              disabled={selectedOffering.size === 0 || selectedSeeking.size === 0 || actionLoading}
              className="bg-[#FF6B6B]/10 text-[#FF6B6B] border border-[#FF6B6B]/30 hover:bg-[#FF6B6B]/20 font-bold"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {t('create', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
