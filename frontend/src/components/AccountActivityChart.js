import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, Gamepad2, 
  Gift, Trophy, ShoppingBag, ArrowLeftRight, Shield
} from 'lucide-react';

// Event type icons and labels
const EVENT_CONFIG = {
  slot: { icon: Gamepad2, label: 'Slot', labelDe: 'Slot', color: '#00F0FF' },
  jackpot: { icon: Trophy, label: 'Jackpot', labelDe: 'Jackpot', color: '#A855F7' },
  wheel: { icon: Gift, label: 'Lucky Wheel', labelDe: 'Glücksrad', color: '#22C55E' },
  chest: { icon: Gift, label: 'Chest', labelDe: 'Truhe', color: '#F59E0B' },
  item_sale: { icon: ShoppingBag, label: 'Item Sold', labelDe: 'Item Verkauft', color: '#10B981' },
  item_purchase: { icon: ShoppingBag, label: 'Item Bought', labelDe: 'Item Gekauft', color: '#EF4444' },
  trade: { icon: ArrowLeftRight, label: 'Trade', labelDe: 'Trade', color: '#6366F1' },
  admin: { icon: Shield, label: 'Admin', labelDe: 'Admin', color: '#F97316' }
};

const AccountActivityChart = () => {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [limit, token]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/account-activity?limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load account activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!data?.events) return [];
    
    return data.events.map((event, idx) => {
      const isAggregated = event.is_aggregated;
      const eventConfig = EVENT_CONFIG[isAggregated ? event.dominant_type : event.event_type] || EVENT_CONFIG.slot;
      
      return {
        ...event,
        index: idx,
        displayLabel: isAggregated 
          ? `${event.bucket_count}x Events` 
          : (language === 'de' ? eventConfig.labelDe : eventConfig.label),
        color: eventConfig.color,
        profit: event.cumulative_profit
      };
    });
  }, [data, language]);

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-100, 100];
    const values = chartData.map(d => d.cumulative_profit);
    const min = Math.min(...values, 0); // Always include 0
    const max = Math.max(...values, 0);
    const padding = Math.max(Math.abs(max - min) * 0.15, 10);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const event = payload[0].payload;
    const isAggregated = event.is_aggregated;
    const eventConfig = EVENT_CONFIG[isAggregated ? event.dominant_type : event.event_type] || EVENT_CONFIG.slot;
    const Icon = eventConfig.icon;
    
    return (
      <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl min-w-[180px]">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4" style={{ color: eventConfig.color }} />
          <span className="text-white font-medium">
            {isAggregated 
              ? `${event.bucket_count} Events` 
              : (language === 'de' ? eventConfig.labelDe : eventConfig.label)}
          </span>
        </div>
        
        {!isAggregated && event.source && (
          <p className="text-white/60 text-xs mb-2">{event.source}</p>
        )}
        
        <p className="text-white/50 text-xs mb-1">
          {new Date(event.timestamp).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
        </p>
        
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
          <span className="text-white/60 text-sm">
            {isAggregated ? (language === 'de' ? 'Summe' : 'Sum') : (language === 'de' ? 'Änderung' : 'Change')}
          </span>
          <span className={`font-mono font-bold ${
            (isAggregated ? event.bucket_sum : event.amount) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {(isAggregated ? event.bucket_sum : event.amount) >= 0 ? '+' : ''}
            {(isAggregated ? event.bucket_sum : event.amount)?.toFixed(2)} G
          </span>
        </div>
        
        <div className="flex justify-between items-center mt-1">
          <span className="text-white/60 text-sm">
            {language === 'de' ? 'Gesamt' : 'Total'}
          </span>
          <span className={`font-mono font-bold text-lg ${
            event.cumulative_profit >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {event.cumulative_profit >= 0 ? '+' : ''}{event.cumulative_profit?.toFixed(2)} G
          </span>
        </div>
        
        {isAggregated && event.types_breakdown && (
          <div className="mt-2 pt-2 border-t border-white/10 text-xs">
            {Object.entries(event.types_breakdown).map(([type, count]) => {
              const cfg = EVENT_CONFIG[type];
              return (
                <div key={type} className="flex justify-between text-white/50">
                  <span>{language === 'de' ? cfg?.labelDe : cfg?.label}</span>
                  <span>{count}x</span>
                </div>
              );
            })}
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

  const stats = data.stats || {};
  const isPositive = stats.current_profit >= 0;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label={language === 'de' ? 'Net Profit' : 'Net Profit'}
          value={stats.current_profit}
          showSign
          color={isPositive ? 'green' : 'red'}
          icon={isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        />
        <StatCard 
          label={language === 'de' ? 'Gewonnen' : 'Total Won'}
          value={stats.total_won}
          color="green"
        />
        <StatCard 
          label={language === 'de' ? 'Verloren' : 'Total Lost'}
          value={stats.total_lost}
          color="red"
        />
        <StatCard 
          label={language === 'de' ? 'Events' : 'Events'}
          value={stats.total_events}
          isNumber
        />
      </div>

      {/* Chart */}
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {language === 'de' ? 'Account-Verlauf' : 'Account Activity'}
            </CardTitle>
            <div className="flex gap-1 bg-black/30 rounded-lg p-1">
              {[50, 100, 200, 500].map(l => (
                <Button
                  key={l}
                  variant={limit === l ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setLimit(l)}
                  className={`h-7 px-2 text-xs font-mono ${
                    limit === l 
                      ? 'bg-primary text-black' 
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
          {data.mode === 'aggregated' && (
            <p className="text-white/40 text-xs mt-1">
              {language === 'de' 
                ? `Aggregiert (${data.bucket_size} Events pro Punkt)` 
                : `Aggregated (${data.bucket_size} events per point)`}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-4">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitGradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="profitGradNeg" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="index" 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                  tickFormatter={(v) => `#${v + 1}`}
                />
                <YAxis 
                  domain={yDomain} 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} 
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v}G`}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulative_profit"
                  stroke={isPositive ? "#22c55e" : "#ef4444"}
                  strokeWidth={2}
                  fill={isPositive ? "url(#profitGradPos)" : "url(#profitGradNeg)"}
                  dot={false}
                  activeDot={{ r: 5, fill: '#00F0FF', stroke: '#000', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(EVENT_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs text-white/50">
              <Icon className="w-3 h-3" style={{ color: cfg.color }} />
              <span>{language === 'de' ? cfg.labelDe : cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, icon, isNumber, showSign }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-500' : 'text-white';
  const borderClass = color === 'green' ? 'border-green-500/20' : color === 'red' ? 'border-red-500/20' : 'border-white/5';
  
  let displayValue = value;
  if (!isNumber) {
    displayValue = `${showSign && value >= 0 ? '+' : ''}${typeof value === 'number' ? value.toFixed(2) : value} G`;
  }

  return (
    <Card className={`bg-[#0A0A0C] ${borderClass}`}>
      <CardContent className="p-3">
        <p className="text-white/40 text-xs mb-1 flex items-center gap-1">
          {icon && <span className={colorClass}>{icon}</span>}
          {label}
        </p>
        <p className={`font-bold text-lg font-mono ${colorClass}`}>{displayValue}</p>
      </CardContent>
    </Card>
  );
};

export default AccountActivityChart;
