import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, BarChart3, LineChart,
  Gamepad2, Gift, Trophy, ShoppingBag, ArrowLeftRight, Shield
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

// Event type colors
const EVENT_COLORS = {
  slot: '#00F0FF',
  jackpot: '#A855F7',
  wheel: '#22C55E',
  chest: '#F59E0B',
  item_sale: '#10B981',
  item_purchase: '#EF4444',
  trade: '#6366F1',
  admin: '#F97316'
};

const AccountActivityChart = () => {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState('1M');
  const [chartType, setChartType] = useState('line'); // 'line' or 'candle'

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
      
      return {
        ...candle,
        index: idx,
        displayTime: isShortRange 
          ? date.toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' }),
        // For area chart
        value: candle.close,
        // For candle coloring
        isPositive: candle.close >= candle.open,
        candleBody: Math.abs(candle.close - candle.open),
        candleBottom: Math.min(candle.open, candle.close)
      };
    });
  }, [data, selectedRange, language]);

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-100, 100];
    const allValues = chartData.flatMap(d => [d.high, d.low]);
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues, 0);
    const padding = Math.max(Math.abs(max - min) * 0.1, 10);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  const stats = data?.stats || {};
  const isPositive = stats.current_profit >= 0;
  const periodPositive = stats.period_change >= 0;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const candle = payload[0].payload;
    
    return (
      <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl min-w-[200px]">
        <p className="text-white/60 text-xs mb-2">
          {new Date(candle.timestamp).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
        </p>
        
        {/* OHLC Data */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
          <div className="flex justify-between">
            <span className="text-white/50">O:</span>
            <span className={`font-mono ${candle.open >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {candle.open?.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">H:</span>
            <span className="text-green-400 font-mono">{candle.high?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">L:</span>
            <span className="text-red-400 font-mono">{candle.low?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">C:</span>
            <span className={`font-mono ${candle.close >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {candle.close?.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Change */}
        <div className="flex justify-between items-center pt-2 border-t border-white/10">
          <span className="text-white/60 text-sm">{language === 'de' ? 'Änderung' : 'Change'}</span>
          <span className={`font-mono font-bold ${candle.net_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {candle.net_change >= 0 ? '+' : ''}{candle.net_change?.toFixed(2)} G
          </span>
        </div>

        {/* Volume */}
        <div className="flex justify-between items-center mt-1">
          <span className="text-white/60 text-sm">{language === 'de' ? 'Events' : 'Volume'}</span>
          <span className="text-white font-mono">{candle.volume}</span>
        </div>

        {/* Breakdown */}
        {candle.breakdown && Object.keys(candle.breakdown).length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 text-xs">
            {Object.entries(candle.breakdown).map(([type, count]) => (
              <div key={type} className="flex justify-between text-white/50">
                <span style={{ color: EVENT_COLORS[type] }}>{type}</span>
                <span>{count}x</span>
              </div>
            ))}
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
              <span>{data.resolution?.toUpperCase() || 'RAW'}</span>
              <span>•</span>
              <span>{chartData.length} {language === 'de' ? 'Punkte' : 'points'}</span>
            </div>
            
            {/* Chart Type Toggle */}
            <div className="flex gap-1 bg-black/30 rounded p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartType('line')}
                className={`h-6 w-6 p-0 ${chartType === 'line' ? 'bg-white/10 text-primary' : 'text-white/40'}`}
              >
                <LineChart className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartType('candle')}
                className={`h-6 w-6 p-0 ${chartType === 'candle' ? 'bg-white/10 text-primary' : 'text-white/40'}`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0}/>
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
                  width={60}
                />
                
                <ReferenceLine 
                  y={0} 
                  stroke="rgba(255,255,255,0.3)" 
                  strokeWidth={1} 
                  strokeDasharray="5 5"
                />
                
                <Tooltip content={<CustomTooltip />} />

                {chartType === 'line' ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke={isPositive ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      fill="url(#profitGradient)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#00F0FF', stroke: '#000', strokeWidth: 2 }}
                    />
                  </>
                ) : (
                  <>
                    {/* Candle Wicks (high-low line) */}
                    {chartData.map((entry, index) => (
                      <ReferenceLine
                        key={`wick-${index}`}
                        segment={[
                          { x: entry.displayTime, y: entry.low },
                          { x: entry.displayTime, y: entry.high }
                        ]}
                        stroke={entry.isPositive ? "#22c55e" : "#ef4444"}
                        strokeWidth={1}
                      />
                    ))}
                    {/* Candle Bodies */}
                    <Bar
                      dataKey="candleBody"
                      stackId="candle"
                      fill="transparent"
                    >
                      {chartData.map((entry, index) => (
                        <rect
                          key={`body-${index}`}
                          fill={entry.isPositive ? "#22c55e" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-xs">
        {Object.entries(EVENT_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-white/40">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{type.replace('_', ' ')}</span>
          </div>
        ))}
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
