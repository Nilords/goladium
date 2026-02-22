import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { 
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, Scatter
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity,
  Gamepad2, Gift, Trophy, ShoppingBag, ArrowLeftRight, Shield, Target
} from 'lucide-react';

// Range configurations
const RANGES = [
  { key: '1D', label: '1D', labelDe: '1T' },
  { key: '1W', label: '1W', labelDe: '1W' },
  { key: '1M', label: '1M', labelDe: '1M' },
  { key: '3M', label: '3M', labelDe: '3M' },
  { key: '6M', label: '6M', labelDe: '6M' },
  { key: '1Y', label: '1Y', labelDe: '1J' },
  { key: 'ALL', label: 'ALL', labelDe: 'ALLE' }
];

// Event type config
const EVENT_CONFIG = {
  slot: { icon: Gamepad2, label: 'Slot', color: '#00F0FF' },
  jackpot: { icon: Trophy, label: 'Jackpot', color: '#A855F7' },
  wheel: { icon: Gift, label: 'Wheel', color: '#22C55E' },
  chest: { icon: Gift, label: 'Chest', color: '#F59E0B' },
  item_sale: { icon: ShoppingBag, label: 'Verkauf', color: '#10B981' },
  item_purchase: { icon: ShoppingBag, label: 'Kauf', color: '#EF4444' },
  trade: { icon: ArrowLeftRight, label: 'Trade', color: '#6366F1' },
  admin: { icon: Shield, label: 'Admin', color: '#F97316' },
  quest: { icon: Target, label: 'Quest', color: '#EC4899' }
};

const AccountActivityChart = () => {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState('1M');

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/account-chart?range=${selectedRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load chart data:', err);
    } finally {
      setLoading(false);
    }
  }, [token, selectedRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = useMemo(() => {
    if (!data?.candles) return [];
    
    return data.candles.map((candle, idx) => {
      const date = new Date(candle.timestamp);
      const isShortRange = selectedRange === '1D' || selectedRange === '1W';
      const eventType = candle.event_type || Object.keys(candle.breakdown || {})[0] || 'slot';
      const config = EVENT_CONFIG[eventType] || EVENT_CONFIG.slot;
      
      return {
        ...candle,
        index: idx,
        displayTime: isShortRange 
          ? date.toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' }),
        fullDate: date.toLocaleString(language === 'de' ? 'de-DE' : 'en-US'),
        value: candle.close,
        eventType,
        eventColor: config.color,
        eventLabel: config.label
      };
    });
  }, [data, selectedRange, language]);

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-100, 100];
    const allValues = chartData.flatMap(d => [d.high || d.close, d.low || d.close]);
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues, 0);
    const padding = Math.max(Math.abs(max - min) * 0.15, 20);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  const stats = data?.stats || {};
  const isPositive = stats.current_profit >= 0;
  const periodPositive = (stats.period_change || 0) >= 0;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const config = EVENT_CONFIG[point.eventType] || EVENT_CONFIG.slot;
    const Icon = config.icon;
    
    return (
      <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl min-w-[220px] backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}20` }}>
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <div>
            <p className="text-white font-medium text-sm">{point.source || config.label}</p>
            <p className="text-white/40 text-xs">{point.fullDate}</p>
          </div>
        </div>
        
        {/* OHLC for aggregated data */}
        {point.volume > 1 && (
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div className="flex justify-between">
              <span className="text-white/50">Open:</span>
              <span className={`font-mono ${point.open >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {point.open?.toFixed(1)}G
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">High:</span>
              <span className="text-green-400 font-mono">{point.high?.toFixed(1)}G</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Low:</span>
              <span className="text-red-400 font-mono">{point.low?.toFixed(1)}G</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Close:</span>
              <span className={`font-mono ${point.close >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {point.close?.toFixed(1)}G
              </span>
            </div>
          </div>
        )}

        {/* Change */}
        <div className="flex justify-between items-center py-2 border-t border-white/10">
          <span className="text-white/60 text-sm">{language === 'de' ? 'Änderung' : 'Change'}</span>
          <span className={`font-mono font-bold text-lg ${point.net_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {point.net_change >= 0 ? '+' : ''}{point.net_change?.toFixed(2)} G
          </span>
        </div>

        {/* Current Position */}
        <div className="flex justify-between items-center">
          <span className="text-white/60 text-sm">{language === 'de' ? 'Position' : 'Position'}</span>
          <span className={`font-mono font-bold ${point.close >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {point.close >= 0 ? '+' : ''}{point.close?.toFixed(2)} G
          </span>
        </div>

        {/* Volume */}
        {point.volume > 1 && (
          <div className="flex justify-between items-center mt-1 text-xs text-white/40">
            <span>Events</span>
            <span>{point.volume}</span>
          </div>
        )}

        {/* Breakdown */}
        {point.breakdown && Object.keys(point.breakdown).length > 1 && (
          <div className="mt-2 pt-2 border-t border-white/10 text-xs">
            <p className="text-white/40 mb-1">Breakdown:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(point.breakdown).map(([type, count]) => {
                const cfg = EVENT_CONFIG[type];
                return (
                  <span key={type} className="px-1.5 py-0.5 rounded text-white/70" style={{ backgroundColor: `${cfg?.color}20` }}>
                    {type}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.mode === 'empty') {
    return (
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardContent className="p-8 text-center">
          <Activity className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">
            {language === 'de' 
              ? 'Noch keine Aktivität. Spiele um Daten zu generieren!' 
              : 'No activity yet. Play to generate data!'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Main Profit Display */}
        <div className="flex items-baseline gap-3">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
              {language === 'de' ? 'Net Profit' : 'Net Profit'}
            </p>
            <p className={`text-3xl font-bold font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{stats.current_profit?.toFixed(2)} G
            </p>
          </div>
          
          {/* Period Change */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${
            periodPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {periodPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="font-mono text-sm">
              {periodPositive ? '+' : ''}{stats.percent_change?.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Range Buttons */}
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-white/5">
          {RANGES.map(r => (
            <Button
              key={r.key}
              variant={selectedRange === r.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedRange(r.key)}
              className={`h-7 px-3 text-xs font-semibold transition-all ${
                selectedRange === r.key 
                  ? 'bg-primary text-black shadow-lg shadow-primary/20' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {language === 'de' ? r.labelDe : r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label={language === 'de' ? 'Perioden-Hoch' : 'Period High'}
          value={stats.period_high}
          color="green"
        />
        <StatCard 
          label={language === 'de' ? 'Perioden-Tief' : 'Period Low'}
          value={stats.period_low}
          color="red"
        />
        <StatCard 
          label={language === 'de' ? 'Gewonnen' : 'Won'}
          value={stats.total_won}
          color="green"
          prefix="+"
        />
        <StatCard 
          label={language === 'de' ? 'Verloren' : 'Lost'}
          value={stats.total_lost}
          color="red"
          prefix="-"
        />
      </div>

      {/* Chart */}
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <span className="px-2 py-0.5 bg-white/5 rounded">{data.resolution?.toUpperCase() || 'RAW'}</span>
              <span>{chartData.length} {language === 'de' ? 'Datenpunkte' : 'data points'}</span>
            </div>
            
            {/* Legend inline */}
            <div className="flex gap-2 flex-wrap justify-end">
              {Object.entries(EVENT_CONFIG).slice(0, 5).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1 text-xs text-white/40">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                  <span>{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart 
                data={chartData} 
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="profitGradientPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="profitGradientNeg" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="rgba(255,255,255,0.05)" 
                  vertical={false} 
                />
                
                <XAxis 
                  dataKey="displayTime" 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                
                <YAxis 
                  domain={yDomain} 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} 
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v}`}
                  tickLine={false}
                  axisLine={false}
                  width={55}
                />
                
                <ReferenceLine 
                  y={0} 
                  stroke="rgba(255,255,255,0.3)" 
                  strokeWidth={1} 
                  strokeDasharray="5 5"
                  label={{ value: '0', position: 'left', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                />
                
                <Tooltip content={<CustomTooltip />} />

                {/* Area fill */}
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="transparent"
                  fill={isPositive ? "url(#profitGradientPos)" : "url(#profitGradientNeg)"}
                />

                {/* Main line - no dots, only activeDot on hover */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={isPositive ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ 
                    r: 6, 
                    fill: '#00F0FF', 
                    stroke: '#000', 
                    strokeWidth: 2,
                    style: { cursor: 'pointer' }
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Full Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-xs pt-2">
        {Object.entries(EVENT_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5 text-white/40">
              <Icon className="w-3 h-3" style={{ color: cfg.color }} />
              <span>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, prefix = '' }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-500' : 'text-white';
  
  return (
    <div className="bg-black/30 rounded-lg p-3 border border-white/5">
      <p className="text-white/40 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg font-mono ${colorClass}`}>
        {prefix}{typeof value === 'number' ? value.toFixed(2) : value} G
      </p>
    </div>
  );
};

export default AccountActivityChart;
