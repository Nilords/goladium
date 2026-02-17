import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Package, ArrowUp, ArrowDown, 
  Activity, ShoppingBag, RefreshCw
} from 'lucide-react';

// Event type labels and colors
const EVENT_TYPES = {
  buy: { label: 'Kauf', labelEn: 'Purchase', color: '#22c55e', icon: '🛒' },
  sell: { label: 'Verkauf', labelEn: 'Sale', color: '#ef4444', icon: '💰' },
  trade_in: { label: 'Trade erhalten', labelEn: 'Trade In', color: '#3b82f6', icon: '📥' },
  trade_out: { label: 'Trade gesendet', labelEn: 'Trade Out', color: '#f97316', icon: '📤' },
  reward: { label: 'Belohnung', labelEn: 'Reward', color: '#a855f7', icon: '🎁' },
  gamepass_reward: { label: 'GamePass', labelEn: 'GamePass', color: '#eab308', icon: '🎫' },
  admin_adjust: { label: 'Admin', labelEn: 'Admin', color: '#6b7280', icon: '⚙️' },
  drop: { label: 'Drop', labelEn: 'Drop', color: '#14b8a6', icon: '🎲' }
};

const InventoryValueChart = () => {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    loadData();
  }, [limit]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/inventory-history?limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load inventory history:', err);
    } finally {
      setLoading(false);
    }
  };

  const processedData = useMemo(() => {
    if (!data?.events) return [];
    return data.events.map((event, i, arr) => ({
      ...event,
      displayIndex: `#${event.event_number}`,
      change: event.delta_value,
      prevValue: i > 0 ? arr[i-1].total_inventory_value_after : event.total_inventory_value_after - event.delta_value
    }));
  }, [data]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const e = payload[0].payload;
    const eventConfig = EVENT_TYPES[e.event_type] || EVENT_TYPES.buy;
    
    return (
      <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl min-w-[200px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{eventConfig.icon}</span>
          <span className="text-white font-medium">
            {language === 'de' ? eventConfig.label : eventConfig.labelEn}
          </span>
        </div>
        
        {e.related_item_name && (
          <p className="text-white/80 text-sm mb-2">
            {e.related_item_name}
          </p>
        )}
        
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
          <span className="text-white/50">Delta:</span>
          <span className={`font-mono ${e.delta_value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {e.delta_value >= 0 ? '+' : ''}{e.delta_value?.toFixed(2)} G
          </span>
          <span className="text-white/50">{language === 'de' ? 'Gesamt' : 'Total'}:</span>
          <span className="text-white font-mono">{e.total_inventory_value_after?.toFixed(2)} G</span>
          <span className="text-white/50">Event:</span>
          <span className="text-white/70">#{e.event_number}</span>
        </div>
        
        <p className="text-white/40 text-xs border-t border-white/10 pt-2 mt-1">
          {new Date(e.timestamp).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
        </p>
      </div>
    );
  };

  const yDomain = useMemo(() => {
    if (!processedData.length) return [0, 100];
    const vals = processedData.map(d => d.total_inventory_value_after);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 10);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [processedData]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const trend = (stats.percent_change || 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard 
          label={language === 'de' ? 'Aktuell' : 'Current'} 
          value={stats.current || 0} 
          icon={<Package className="w-3 h-3" />}
        />
        <StatCard 
          label="ATH" 
          value={stats.highest || 0} 
          color="green" 
          icon={<ArrowUp className="w-3 h-3" />} 
        />
        <StatCard 
          label="ATL" 
          value={stats.lowest || 0} 
          color="red" 
          icon={<ArrowDown className="w-3 h-3" />} 
        />
        <StatCard 
          label={language === 'de' ? 'Spanne' : 'Range'} 
          value={stats.range || 0} 
          color="purple" 
          icon={<Activity className="w-3 h-3" />} 
        />
        <StatCard 
          label={language === 'de' ? 'Änderung' : 'Change'} 
          value={`${trend ? '+' : ''}${stats.percent_change || 0}%`} 
          color={trend ? 'green' : 'red'} 
          icon={trend ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          isPercent
        />
      </div>

      {/* Chart */}
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-400" />
              {language === 'de' ? 'Inventar-Wert Verlauf' : 'Inventory Value History'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 bg-black/30 rounded-lg p-1">
                {[30, 50, 100].map(l => (
                  <Button
                    key={l}
                    variant={limit === l ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setLimit(l)}
                    className={`h-7 px-2 text-xs font-mono ${
                      limit === l 
                        ? 'bg-purple-500 text-white' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {l}
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadData}
                className="h-7 px-2 text-white/60 hover:text-white"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {processedData.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-white/40 gap-2">
              <ShoppingBag className="w-10 h-10 opacity-30" />
              <p>
                {language === 'de' 
                  ? 'Noch keine Aktivitäten. Kaufe Items um Daten zu generieren!' 
                  : 'No activity yet. Purchase items to generate data!'}
              </p>
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inventoryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="displayIndex" 
                    stroke="rgba(255,255,255,0.3)" 
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={yDomain} 
                    stroke="rgba(255,255,255,0.3)" 
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} 
                    tickFormatter={v => `${v}G`} 
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="total_inventory_value_after"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={processedData.length <= 30 ? { r: 3, fill: '#a855f7', stroke: '#000', strokeWidth: 1 } : false}
                    activeDot={{ r: 5, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events Summary */}
      {processedData.length > 0 && (
        <Card className="bg-[#0A0A0C] border-white/5">
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-white/60">
              {language === 'de' ? 'Letzte Events' : 'Recent Events'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[150px] overflow-y-auto">
              {processedData.slice(-5).reverse().map((event, idx) => {
                const config = EVENT_TYPES[event.event_type] || EVENT_TYPES.buy;
                return (
                  <div key={idx} className="flex items-center justify-between px-4 py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <div>
                        <p className="text-white text-sm">{event.related_item_name || (language === 'de' ? config.label : config.labelEn)}</p>
                        <p className="text-white/40 text-xs">#{event.event_number}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-sm ${event.delta_value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {event.delta_value >= 0 ? '+' : ''}{event.delta_value?.toFixed(2)} G
                      </p>
                      <p className="text-white/40 text-xs font-mono">{event.total_inventory_value_after?.toFixed(2)} G</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color, icon, isPercent }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-500' : color === 'purple' ? 'text-purple-400' : 'text-white';
  const borderClass = color === 'green' ? 'border-green-500/20' : color === 'red' ? 'border-red-500/20' : color === 'purple' ? 'border-purple-500/20' : 'border-white/5';
  
  let displayValue = value;
  if (!isPercent) {
    displayValue = `${typeof value === 'number' ? value.toFixed(2) : value} G`;
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

export default InventoryValueChart;
