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
  TrendingUp, TrendingDown, Activity, ArrowUp, ArrowDown, 
  Gamepad2, Trophy, Sparkles, Coins
} from 'lucide-react';

// Stock-market style timeframe configuration
const TIMEFRAME_OPTIONS = [
  { key: '1m', label: '1m', labelDe: '1m', description: 'Last hour, per minute' },
  { key: '15m', label: '15m', labelDe: '15m', description: 'Last 6 hours, 15-min intervals' },
  { key: '1h', label: '1h', labelDe: '1h', description: 'Last 24 hours, hourly' },
  { key: '3d', label: '3D', labelDe: '3T', description: 'Last 3 days' },
  { key: '1w', label: '1W', labelDe: '1W', description: 'Last week' },
  { key: '1mo', label: '1M', labelDe: '1M', description: 'Last month' },
];

const AccountValueChart = () => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [chartData, setChartData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1h');

  useEffect(() => {
    loadData();
  }, [timeframe]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chartRes, statsRes] = await Promise.all([
        fetch(`/api/user/value-history?timeframe=${timeframe}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/user/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (chartRes.ok) setChartData(await chartRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const processedChartData = useMemo(() => {
    if (!chartData?.data_points) return [];
    return chartData.data_points.map((point, i, arr) => ({
      ...point,
      displayTime: formatTime(point.timestamp, timeframe),
      change: i > 0 ? point.total_value - arr[i-1].total_value : 0
    }));
  }, [chartData, timeframe]);

  function formatTime(ts, tf) {
    const d = new Date(ts);
    const locale = language === 'de' ? 'de-DE' : 'en-US';
    
    // Format based on timeframe bucket
    switch(tf) {
      case '1m':
      case '15m':
        // Show time with seconds for minute-level data
        return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      case '1h':
        // Show time for hourly data
        return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      case '3d':
        // Show day and time
        return d.toLocaleDateString(locale, { weekday: 'short', hour: '2-digit' });
      case '1w':
        // Show day and time
        return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
      case '1mo':
        // Show date
        return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      default:
        return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    const hasOHLC = p.open !== undefined && p.high !== undefined;
    
    return (
      <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl min-w-[160px]">
        <p className="text-white/60 text-xs mb-2">{new Date(p.timestamp).toLocaleString()}</p>
        
        {hasOHLC && p.count > 1 ? (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
              <span className="text-white/50">Open:</span>
              <span className="text-white font-mono">{p.open?.toFixed(2)} G</span>
              <span className="text-white/50">High:</span>
              <span className="text-green-400 font-mono">{p.high?.toFixed(2)} G</span>
              <span className="text-white/50">Low:</span>
              <span className="text-red-400 font-mono">{p.low?.toFixed(2)} G</span>
              <span className="text-white/50">Close:</span>
              <span className="text-white font-mono">{p.close?.toFixed(2)} G</span>
            </div>
          </>
        ) : (
          <p className="text-white font-bold text-lg">{p.total_value?.toFixed(2)} G</p>
        )}
        
        <p className={`text-sm ${p.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {p.change >= 0 ? '+' : ''}{p.change?.toFixed(2) || '0.00'} G
        </p>
      </div>
    );
  };

  const yDomain = useMemo(() => {
    if (!processedChartData.length) return [-10, 100];
    const vals = processedChartData.map(d => d.total_value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 5);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [processedChartData]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const chartStats = chartData?.stats || {};
  const overallStats = stats?.overall || {};
  const trend = chartStats.percent_change >= 0;

  // Get game-specific stats
  const slotStats = Object.values(stats?.by_game || {}).find(g => g.game_type === 'slot');
  const jackpotStats = Object.values(stats?.by_game || {}).find(g => g.game_type === 'jackpot');

  return (
    <div className="space-y-6">
      {/* Overview Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label={language === 'de' ? 'Gesamt Spins' : 'Total Spins'} 
          value={overallStats.total_spins || 0} 
          icon={<Sparkles className="w-4 h-4" />}
          isNumber
        />
        <StatCard 
          label={language === 'de' ? 'Gewettet' : 'Wagered'} 
          value={overallStats.total_wagered || 0} 
          icon={<Coins className="w-4 h-4" />}
          color="gold"
        />
        <StatCard 
          label={language === 'de' ? 'Gewonnen' : 'Won'} 
          value={overallStats.total_won || 0} 
          icon={<TrendingUp className="w-4 h-4" />}
          color="green"
        />
        <StatCard 
          label={language === 'de' ? 'Net Profit' : 'Net Profit'} 
          value={overallStats.net_profit || 0} 
          icon={(overallStats.net_profit || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={(overallStats.net_profit || 0) >= 0 ? 'green' : 'red'}
          showSign
        />
      </div>

      {/* Chart Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={language === 'de' ? 'Aktuell' : 'Current'} value={chartStats.current || 0} />
        <StatCard label="ATH" value={chartStats.all_time_high || 0} color="green" icon={<ArrowUp className="w-3 h-3" />} />
        <StatCard label="ATL" value={chartStats.all_time_low || 0} color="red" icon={<ArrowDown className="w-3 h-3" />} />
        <StatCard label={language === 'de' ? 'Spanne' : 'Range'} value={chartStats.range || 0} color="purple" icon={<Activity className="w-3 h-3" />} />
        <StatCard 
          label={language === 'de' ? 'Änderung' : 'Change'} 
          value={`${trend ? '+' : ''}${chartStats.percent_change || 0}%`} 
          color={trend ? 'green' : 'red'} 
          icon={trend ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          isPercent
        />
      </div>

      {/* Chart */}
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {language === 'de' ? 'Kontowert-Verlauf' : 'Account Value History'}
            </CardTitle>
            <div className="flex gap-0.5 bg-black/30 rounded-lg p-1">
              {TIMEFRAME_OPTIONS.map(tf => (
                <Button
                  key={tf.key}
                  variant={timeframe === tf.key ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeframe(tf.key)}
                  className={`h-7 px-2 sm:px-3 text-xs font-mono ${
                    timeframe === tf.key 
                      ? 'bg-primary text-black' 
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  title={tf.description}
                >
                  {language === 'de' ? tf.labelDe : tf.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {processedChartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-white/40">
              {language === 'de' ? 'Noch keine Daten. Spiele um Daten zu generieren!' : 'No data yet. Play to generate data!'}
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="displayTime" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                  <YAxis domain={yDomain} stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickFormatter={v => `${v}G`} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total_value"
                    stroke={trend ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    fill={trend ? "url(#gradPos)" : "url(#gradNeg)"}
                    dot={false}
                    activeDot={{ r: 5, fill: '#00F0FF', stroke: '#000', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Game Stats */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Slots */}
        <Card className="bg-[#0A0A0C] border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-primary" />
              {slotStats?.slot_name || (language === 'de' ? 'Slot Machine' : 'Slot Machine')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatRow label={language === 'de' ? 'Spins' : 'Spins'} value={slotStats?.total_bets || 0} />
            <StatRow label={language === 'de' ? 'Gewettet' : 'Wagered'} value={`${(slotStats?.total_wagered || 0).toFixed(2)} G`} color="gold" />
            <StatRow label={language === 'de' ? 'Gewonnen' : 'Won'} value={`${(slotStats?.total_won || 0).toFixed(2)} G`} color="green" />
            <StatRow label={language === 'de' ? 'Gewinnrate' : 'Win Rate'} value={`${slotStats?.win_rate || 0}%`} color="primary" />
          </CardContent>
        </Card>

        {/* Jackpot */}
        <Card className="bg-[#0A0A0C] border-white/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-purple-400" />
              Jackpot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatRow label={language === 'de' ? 'Teilnahmen' : 'Entries'} value={jackpotStats?.total_bets || 0} />
            <StatRow label={language === 'de' ? 'Gewettet' : 'Wagered'} value={`${(jackpotStats?.total_wagered || 0).toFixed(2)} G`} color="gold" />
            <StatRow label={language === 'de' ? 'Gewonnen' : 'Won'} value={`${(jackpotStats?.total_won || 0).toFixed(2)} G`} color="green" />
            <StatRow label={language === 'de' ? 'Gewinnrate' : 'Win Rate'} value={`${jackpotStats?.win_rate || 0}%`} color="purple" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, icon, isPercent, isNumber, showSign }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-500' : color === 'purple' ? 'text-purple-400' : color === 'gold' ? 'text-yellow-500' : 'text-white';
  const borderClass = color === 'green' ? 'border-green-500/20' : color === 'red' ? 'border-red-500/20' : color === 'gold' ? 'border-yellow-500/20' : 'border-white/5';
  
  let displayValue = value;
  if (!isPercent && !isNumber) {
    displayValue = `${showSign && value >= 0 ? '+' : ''}${typeof value === 'number' ? value.toFixed(2) : value} G`;
  } else if (isNumber) {
    displayValue = value;
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

const StatRow = ({ label, value, color }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'gold' ? 'text-yellow-500' : color === 'purple' ? 'text-purple-400' : color === 'primary' ? 'text-primary' : 'text-white';
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span className={`font-mono ${colorClass}`}>{value}</span>
    </div>
  );
};

export default AccountValueChart;
