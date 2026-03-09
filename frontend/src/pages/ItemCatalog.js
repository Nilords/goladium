import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  Search,
  TrendingUp,
  Package,
  Users,
  Tag,
  Loader2,
  BookOpen,
  ArrowUpDown,
  Store,
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
    catalog: { de: 'Item-Katalog', en: 'Item Catalog' },
    searchItems: { de: 'Items suchen...', en: 'Search items...' },
    all: { de: 'Alle', en: 'All' },
    name: { de: 'Name', en: 'Name' },
    rapDesc: { de: 'RAP absteigend', en: 'RAP: High to Low' },
    rapAsc: { de: 'RAP aufsteigend', en: 'RAP: Low to High' },
    valueDesc: { de: 'Value absteigend', en: 'Value: High to Low' },
    rarity: { de: 'Seltenheit', en: 'Rarity' },
    noItems: { de: 'Keine Items gefunden', en: 'No items found' },
    listings: { de: 'Angebote', en: 'Listings' },
    owners: { de: 'Besitzer', en: 'Owners' },
    inCirculation: { de: 'Im Umlauf', en: 'In Circulation' },
    cheapest: { de: 'Ab', en: 'From' },
    totalItems: { de: 'Items gesamt', en: 'Total Items' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

const CatalogItemCard = ({ item, onClick, lang }) => {
  const colors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;

  return (
    <Card
      data-testid={`catalog-item-${item.item_id}`}
      onClick={() => onClick(item.item_id)}
      className="group bg-[#0A0A0C] border border-white/5 hover:border-white/20 cursor-pointer transition-all duration-300 hover:shadow-lg overflow-hidden"
    >
      <div
        className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${colors.bg}, transparent)` }}
      >
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-20 w-20 object-contain" />
        ) : (
          <Package className="w-10 h-10" style={{ color: colors.text, opacity: 0.5 }} />
        )}
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
          style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
        >
          {item.rarity}
        </div>
      </div>

      <CardContent className="p-3 space-y-1.5">
        <p className="text-white font-semibold text-sm truncate">{item.name}</p>

        <div className="flex items-center justify-between">
          {item.rap > 0 ? (
            <span className="text-[#00F0FF] font-mono text-sm flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {formatCurrency(item.rap)} G
            </span>
          ) : (
            <span className="text-white/20 font-mono text-xs">No RAP</span>
          )}
          {item.value > 0 && (
            <span className="text-[#FFD700] font-mono text-xs">
              V: {formatCurrency(item.value)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-white/30 text-[10px] font-mono">
          <span>{item.total_quantity}x</span>
          {item.active_listings > 0 && (
            <span className="text-[#00FF94]">
              {item.active_listings} {t('listings', lang)}
            </span>
          )}
          {item.cheapest_price && (
            <span className="text-[#FFD700]">
              {t('cheapest', lang)} {formatCurrency(item.cheapest_price)}G
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default function ItemCatalog() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [rarityFilter, setRarityFilter] = useState('all');

  const loadCatalog = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort: sortBy, limit: '200' });
      if (rarityFilter !== 'all') params.set('rarity', rarityFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/items/catalog?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Catalog load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [sortBy, rarityFilter, search]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1
            data-testid="catalog-title"
            className="text-3xl sm:text-4xl font-bold text-white tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            <BookOpen className="w-8 h-8 inline-block mr-3 text-[#A855F7]" />
            {t('catalog', lang)}
          </h1>
          <p className="text-white/40 text-sm mt-1 font-mono">
            {total} {t('totalItems', lang)}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              data-testid="catalog-search"
              placeholder={t('searchItems', lang)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-black/50 border-white/10 focus:border-[#A855F7] text-white placeholder:text-white/30"
            />
          </div>
          <select
            data-testid="catalog-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:border-[#A855F7] outline-none"
          >
            <option value="name">{t('name', lang)}</option>
            <option value="rap_desc">{t('rapDesc', lang)}</option>
            <option value="rap_asc">{t('rapAsc', lang)}</option>
            <option value="value_desc">{t('valueDesc', lang)}</option>
            <option value="rarity">{t('rarity', lang)}</option>
          </select>
          <select
            data-testid="catalog-rarity"
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:border-[#A855F7] outline-none"
          >
            <option value="all">{t('all', lang)}</option>
            <option value="common">Common</option>
            <option value="uncommon">Uncommon</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#A855F7] animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 font-mono">{t('noItems', lang)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {items.map((item) => (
              <CatalogItemCard
                key={item.item_id}
                item={item}
                onClick={(id) => navigate(`/item/${id}`)}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
