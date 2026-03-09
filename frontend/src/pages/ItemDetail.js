import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatCurrencyFull } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  ArrowLeft,
  TrendingUp,
  Package,
  Users,
  Store,
  Clock,
  Tag,
  BarChart3,
  Loader2,
  ShoppingCart,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';

const RARITY_COLORS = {
  common: { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.4)', text: '#9CA3AF', glow: 'rgba(156,163,175,0.2)' },
  uncommon: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', text: '#22C55E', glow: 'rgba(34,197,94,0.2)' },
  rare: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#3B82F6', glow: 'rgba(59,130,246,0.2)' },
  epic: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)', text: '#A855F7', glow: 'rgba(168,85,247,0.2)' },
  legendary: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B', glow: 'rgba(245,158,11,0.2)' },
};

const t = (key, lang) => {
  const translations = {
    back: { de: 'Zurück', en: 'Back' },
    rap: { de: 'RAP', en: 'RAP' },
    value: { de: 'Value', en: 'Value' },
    cheapest: { de: 'Günstigstes Angebot', en: 'Cheapest Listing' },
    activeListings: { de: 'Aktive Angebote', en: 'Active Listings' },
    owners: { de: 'Besitzer', en: 'Owners' },
    inCirculation: { de: 'Im Umlauf', en: 'In Circulation' },
    priceHistory: { de: 'Preisverlauf', en: 'Price History' },
    recentSales: { de: 'Letzte Verkäufe', en: 'Recent Sales' },
    noSales: { de: 'Noch keine Verkäufe', en: 'No sales yet' },
    buyer: { de: 'Käufer', en: 'Buyer' },
    seller: { de: 'Verkäufer', en: 'Seller' },
    price: { de: 'Preis', en: 'Price' },
    date: { de: 'Datum', en: 'Date' },
    viewOnMarket: { de: 'Auf dem Marktplatz ansehen', en: 'View on Marketplace' },
    notFound: { de: 'Item nicht gefunden', en: 'Item not found' },
    loading: { de: 'Lade...', en: 'Loading...' },
    noData: { de: 'Keine Daten', en: 'No data' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

const StatBox = ({ label, value, icon: Icon, color = '#00F0FF', sub = null }) => (
  <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col gap-1">
    <div className="flex items-center gap-2 text-white/40 text-xs font-mono uppercase tracking-wider">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      {label}
    </div>
    <p className="text-white font-mono font-bold text-xl" style={{ color }}>
      {value}
    </p>
    {sub && <p className="text-white/30 text-xs font-mono">{sub}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0C] border border-white/10 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-white/50 mb-1">{label}</p>
      <p className="text-[#00F0FF] font-mono font-bold">{formatCurrency(payload[0].value)} G</p>
    </div>
  );
};

export default function ItemDetail() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language;

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/items/${itemId}/details`);
        if (res.ok) {
          setItem(await res.json());
        }
      } catch (e) {
        console.error('Failed to load item:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [itemId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <Navbar />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-8 h-8 text-[#A855F7] animate-spin" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <Package className="w-16 h-16 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 font-mono text-lg">{t('notFound', lang)}</p>
          <Button variant="ghost" onClick={() => navigate('/catalog')} className="mt-4 text-white/50">
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('back', lang)}
          </Button>
        </div>
      </div>
    );
  }

  const colors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const sales = item.recent_sales || [];
  const chartData = [...sales].reverse().map((s, i) => ({
    idx: i + 1,
    price: s.price,
    date: new Date(s.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
  }));

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          data-testid="back-btn"
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-white/40 hover:text-white mb-6 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> {t('back', lang)}
        </Button>

        {/* Item Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Item Visual */}
          <div
            className="w-full md:w-64 h-52 rounded-xl flex items-center justify-center flex-shrink-0 border"
            style={{
              background: `linear-gradient(135deg, ${colors.bg}, #0A0A0C)`,
              borderColor: colors.border,
              boxShadow: `0 0 40px ${colors.glow}`,
            }}
          >
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="h-32 w-32 object-contain" />
            ) : (
              <Package className="w-20 h-20" style={{ color: colors.text, opacity: 0.4 }} />
            )}
          </div>

          {/* Item Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge
                data-testid="item-rarity"
                className="text-xs font-mono uppercase tracking-wider border"
                style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
              >
                {item.rarity}
              </Badge>
              <span className="text-white/20 text-xs font-mono">{item.item_id}</span>
            </div>
            <h1
              data-testid="item-name"
              className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {item.name}
            </h1>
            {item.flavor_text && (
              <p className="text-white/40 text-sm italic mb-4">{item.flavor_text}</p>
            )}

            {/* Quick Actions */}
            <Button
              data-testid="view-market-btn"
              onClick={() => navigate(`/marketplace?search=${encodeURIComponent(item.name)}`)}
              className="bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-[#00F0FF]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.3)] font-bold uppercase tracking-wider text-xs"
            >
              <Store className="w-4 h-4 mr-2" />
              {t('viewOnMarket', lang)} ({item.active_listings})
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          <StatBox
            label={t('rap', lang)}
            value={item.rap > 0 ? `${formatCurrency(item.rap)} G` : '-'}
            icon={TrendingUp}
            color="#00F0FF"
          />
          <StatBox
            label={t('value', lang)}
            value={item.value > 0 ? `${formatCurrency(item.value)} G` : '-'}
            icon={Tag}
            color="#FFD700"
          />
          <StatBox
            label={t('cheapest', lang)}
            value={item.cheapest_price ? `${formatCurrency(item.cheapest_price)} G` : '-'}
            icon={ShoppingCart}
            color="#00FF94"
          />
          <StatBox
            label={t('activeListings', lang)}
            value={item.active_listings}
            icon={Store}
            color="#A855F7"
          />
          <StatBox
            label={t('owners', lang)}
            value={item.owner_count}
            icon={Users}
          />
          <StatBox
            label={t('inCirculation', lang)}
            value={item.total_quantity}
            icon={Package}
          />
        </div>

        {/* Price Chart */}
        <Card className="bg-[#0A0A0C] border border-white/5 mb-8">
          <CardContent className="p-4">
            <h2 className="text-white/60 text-sm font-mono uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#00F0FF]" />
              {t('priceHistory', lang)}
            </h2>
            {chartData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#333" tick={{ fill: '#555', fontSize: 10 }} />
                    <YAxis stroke="#333" tick={{ fill: '#555', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#00F0FF"
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center">
                <p className="text-white/20 font-mono text-sm">{t('noData', lang)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales Table */}
        <Card className="bg-[#0A0A0C] border border-white/5">
          <CardContent className="p-4">
            <h2 className="text-white/60 text-sm font-mono uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#FFD700]" />
              {t('recentSales', lang)}
            </h2>

            {sales.length === 0 ? (
              <p className="text-white/20 font-mono text-sm text-center py-8">{t('noSales', lang)}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-white/30 font-mono text-xs uppercase">
                      <th className="text-left py-2 pr-4">{t('price', lang)}</th>
                      <th className="text-left py-2 pr-4">{t('buyer', lang)}</th>
                      <th className="text-left py-2 pr-4">{t('seller', lang)}</th>
                      <th className="text-right py-2">{t('date', lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale, i) => (
                      <tr key={sale.sale_id || i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-4 text-[#FFD700] font-mono font-bold">
                          {formatCurrency(sale.price)} G
                        </td>
                        <td className="py-2.5 pr-4 text-white/60">{sale.buyer_username}</td>
                        <td className="py-2.5 pr-4 text-white/60">{sale.seller_username}</td>
                        <td className="py-2.5 text-right text-white/30 font-mono text-xs">
                          {new Date(sale.timestamp).toLocaleString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
