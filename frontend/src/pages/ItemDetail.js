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
  Flame,
  History,
  ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, Bar, BarChart, ComposedChart,
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
    totalEverCreated: { de: 'Jemals erstellt', en: 'Total Ever Created' },
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
    demand: { de: 'Nachfrage', en: 'Demand' },
    demandNone: { de: 'Keine', en: 'None' },
    demandLow: { de: 'Niedrig', en: 'Low' },
    demandMedium: { de: 'Mittel', en: 'Medium' },
    demandHigh: { de: 'Hoch', en: 'High' },
    demandExtreme: { de: 'Extrem', en: 'Extreme' },
    seekingAds: { de: 'Suchanzeigen', en: 'Seeking Ads' },
    salesWeek: { de: 'Verkäufe (7T)', en: 'Sales (7d)' },
    ownerHistory: { de: 'Besitzer-Verlauf', en: 'Owner History' },
    noHistory: { de: 'Noch kein Verlauf', en: 'No history yet' },
    acquiredVia: { de: 'über', en: 'via' },
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

const ChartTooltip = ({ active, payload, label, lang }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="bg-[#0A0A0C] border border-white/10 rounded-lg p-3 text-xs shadow-xl min-w-[140px]">
      <p className="text-white/50 mb-1.5">{label}</p>
      {data?.price != null && (
        <p className="text-[#00F0FF] font-mono font-bold text-sm">
          {lang === 'de' ? 'Kauf' : 'Sale'}: {formatCurrency(data.price)} G
        </p>
      )}
      {data?.rap > 0 && (
        <p className="text-[#FFD700] font-mono text-xs mt-0.5">RAP: {formatCurrency(data.rap)} G</p>
      )}
      {data?.value > 0 && (
        <p className="text-[#A855F7] font-mono text-xs mt-0.5">Value: {formatCurrency(data.value)} G</p>
      )}
      {data?.buyer && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 text-white/40">
          <p>{data.buyer} &larr; {data.seller}</p>
        </div>
      )}
    </div>
  );
};

const DEMAND_CONFIG = {
  none: { color: '#555', width: '5%' },
  low: { color: '#9CA3AF', width: '25%' },
  medium: { color: '#F59E0B', width: '50%' },
  high: { color: '#EF4444', width: '75%' },
  extreme: { color: '#FF0040', width: '100%' },
};

const DemandBar = ({ demand, lang }) => {
  const config = DEMAND_CONFIG[demand.label] || DEMAND_CONFIG.none;
  const labelKey = `demand${demand.label.charAt(0).toUpperCase() + demand.label.slice(1)}`;

  return (
    <Card data-testid="demand-indicator" className="bg-[#0A0A0C] border border-white/5 mb-8">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white/60 text-sm font-mono uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4" style={{ color: config.color }} />
            {t('demand', lang)}
            {demand.is_manual && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
                MANUAL
              </span>
            )}
          </h2>
          <div className="flex items-center gap-4 text-xs text-white/30 font-mono">
            <span>{demand.seeking_ads} {t('seekingAds', lang)}</span>
            <span>{demand.recent_sales_7d} {t('salesWeek', lang)}</span>
            <span>{demand.active_listings} {t('activeListings', lang)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: config.width,
                background: `linear-gradient(90deg, ${config.color}80, ${config.color})`,
                boxShadow: demand.label !== 'none' ? `0 0 10px ${config.color}40` : 'none',
              }}
            />
          </div>
          <span
            className="text-sm font-mono font-bold uppercase tracking-wider min-w-[80px] text-right"
            style={{ color: config.color }}
          >
            {t(labelKey, lang)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default function ItemDetail() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language;

  const [item, setItem] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [detailRes, chartRes] = await Promise.all([
          fetch(`/api/items/${itemId}/details`),
          fetch(`/api/items/${itemId}/chart-data`),
        ]);
        if (detailRes.ok) setItem(await detailRes.json());
        if (chartRes.ok) {
          const cd = await chartRes.json();
          // Build unified timeline from sales + value changes
          const points = [];
          
          // Add sales as data points
          (cd.sales || []).forEach((s) => {
            points.push({
              timestamp: s.timestamp,
              price: s.price,
              rap: s.rap || null,
              value: null,
              buyer: s.buyer,
              seller: s.seller,
              type: 'sale',
            });
          });
          
          // Add value changes
          (cd.value_history || []).forEach((v) => {
            points.push({
              timestamp: v.timestamp,
              price: null,
              rap: null,
              value: v.value,
              type: 'value',
            });
          });
          
          // Sort by time
          points.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          // Forward-fill value and RAP so lines are continuous
          let lastValue = cd.current_value || 0;
          let lastRap = 0;
          const filled = points.map((p) => {
            if (p.value !== null) lastValue = p.value;
            if (p.rap !== null) lastRap = p.rap;
            return {
              ...p,
              value: lastValue,
              rap: lastRap || null,
              date: new Date(p.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            };
          });
          
          setChartData(filled);
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
          <StatBox
            label={t('totalEverCreated', lang)}
            value={item.total_ever_created ?? item.total_quantity}
            icon={Package}
            color="#A855F7"
          />
        </div>

        {/* Demand Indicator */}
        {item.demand && (
          <DemandBar demand={item.demand} lang={lang} />
        )}

        {/* Chart: Value / RAP / Käufe over time */}
        <Card className="bg-[#0A0A0C] border border-white/5 mb-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white/60 text-sm font-mono uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#00F0FF]" />
                {t('priceHistory', lang)}
              </h2>
              {chartData.length > 0 && (
                <div className="flex items-center gap-4 text-[10px] font-mono text-white/40">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#00F0FF]" />
                    {lang === 'de' ? 'Käufe' : 'Sales'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#FFD700]" /> RAP
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#A855F7]" style={{ borderTop: '2px dashed #A855F7', height: 0 }} /> Value
                  </span>
                </div>
              )}
            </div>
            {chartData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#333" tick={{ fill: '#555', fontSize: 10 }} />
                    <YAxis stroke="#333" tick={{ fill: '#555', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip lang={lang} />} />
                    {/* Sales price (filled area) */}
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#00F0FF"
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                      dot={{ r: 3, fill: '#00F0FF', strokeWidth: 0 }}
                      connectNulls={false}
                    />
                    {/* RAP line */}
                    <Line
                      type="monotone"
                      dataKey="rap"
                      stroke="#FFD700"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    {/* Value line (dashed) */}
                    <Line
                      type="stepAfter"
                      dataKey="value"
                      stroke="#A855F7"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center">
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

        {/* Owner History */}
        <Card className="bg-[#0A0A0C] border border-white/5">
          <CardContent className="p-4">
            <h2 className="text-white/60 text-sm font-mono uppercase tracking-wider mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-[#A855F7]" />
              {t('ownerHistory', lang)}
            </h2>

            {(!item.owner_history || item.owner_history.length === 0) ? (
              <p className="text-white/20 font-mono text-sm text-center py-8">{t('noHistory', lang)}</p>
            ) : (
              <div className="space-y-2">
                {item.owner_history.map((record, i) => (
                  <div key={record.record_id || i} className="flex items-center gap-3 py-2 px-3 rounded-md bg-black/30 border border-white/[0.03]">
                    <div className="w-7 h-7 rounded-full bg-[#A855F7]/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5 text-[#A855F7]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {record.username}
                      </p>
                      <p className="text-white/30 text-xs">
                        {t('acquiredVia', lang)} <span className="text-white/50 capitalize">{record.acquired_via}</span>
                        {record.released_at && (
                          <span className="text-white/20">
                            {' '}<ArrowRight className="w-3 h-3 inline" />{' '}
                            {new Date(record.released_at).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-white/20 text-xs font-mono flex-shrink-0">
                      {new Date(record.acquired_at).toLocaleDateString('de-DE', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
