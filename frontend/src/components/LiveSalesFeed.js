import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import { ScrollArea } from './ui/scroll-area';
import {
  ShoppingCart,
  TrendingUp,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const RARITY_COLORS = {
  common: '#9CA3AF',
  uncommon: '#22C55E',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

const t = (key, lang) => {
  const translations = {
    liveSales: { de: 'Live Verkäufe', en: 'Live Sales' },
    noSales: { de: 'Noch keine Verkäufe', en: 'No sales yet' },
    soldFor: { de: 'für', en: 'for' },
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

const SaleEntry = ({ sale, lang }) => {
  const color = RARITY_COLORS[sale.item_rarity] || RARITY_COLORS.common;

  return (
    <div
      data-testid={`sale-entry-${sale.sale_id}`}
      className="flex items-center gap-2.5 py-2 px-3 rounded-md hover:bg-white/[0.03] transition-colors duration-150 animate-fade-in"
    >
      <div
        className="w-7 h-7 rounded flex-shrink-0 flex items-center justify-center"
        style={{ background: `${color}20` }}
      >
        <Package className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">{sale.item_name}</p>
        <p className="text-white/30 text-[10px] truncate">
          {sale.buyer_username} {t('soldFor', lang)}{' '}
          <span className="text-[#FFD700] font-mono">{formatCurrency(sale.price)}G</span>
        </p>
      </div>
      <span className="text-white/20 text-[10px] font-mono flex-shrink-0">
        {timeAgo(sale.timestamp, lang)}
      </span>
    </div>
  );
};

export default function LiveSalesFeed() {
  const { language } = useLanguage();
  const lang = language;
  const [sales, setSales] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef(null);

  const loadSales = async () => {
    try {
      const res = await fetch('/api/marketplace/recent-sales?limit=15');
      if (res.ok) {
        const data = await res.json();
        setSales(data.sales || []);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    loadSales();
    intervalRef.current = setInterval(loadSales, 15000); // Refresh every 15s
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div
      data-testid="live-sales-feed"
      className="bg-[#0A0A0C] border border-white/5 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00FF94] animate-pulse" />
          <span className="text-white/60 text-xs font-mono uppercase tracking-wider">
            {t('liveSales', lang)}
          </span>
          {sales.length > 0 && (
            <span className="text-white/20 text-[10px] font-mono">({sales.length})</span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-white/30" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-white/30" />
        )}
      </div>

      {/* Sales List */}
      {!collapsed && (
        <div className="max-h-80 overflow-y-auto">
          {sales.length === 0 ? (
            <div className="py-8 text-center">
              <ShoppingCart className="w-6 h-6 text-white/10 mx-auto mb-2" />
              <p className="text-white/20 text-xs font-mono">{t('noSales', lang)}</p>
            </div>
          ) : (
            <div className="py-1">
              {sales.map((sale) => (
                <SaleEntry key={sale.sale_id} sale={sale} lang={lang} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
