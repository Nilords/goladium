import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, ArrowUp, ArrowDown, Clock, Calendar, CalendarDays } from 'lucide-react';

const AccountValueChart = () => {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('daily');

  useEffect(() => {
    loadValueHistory();
  }, [timeframe]);

  const loadValueHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/value-history?timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to load value history:', err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!data?.data_points) return [];
    return data.data_points.map((point, i, arr) => ({
      ...point,
      displayTime: formatTime(point.timestamp, timeframe),
      change: i > 0 ? point.total_value - arr[i-1].total_value : 0
    }));
  }, [data, timeframe]);

  function formatTime(ts, tf) {
    const d = new Date(ts);
    if (tf === 'hourly') return d.toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' });
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="bg-black/90 border border-white/20 rounded-lg p-3 shadow-xl">
        <p className="text-white/60 text-xs mb-1">{new Date(p.timestamp).toLocaleString()}</p>
        <p className="text-white font-bold text-lg">{p.total_value.toFixed(2)} G</p>
        <p className={`text-sm ${p.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)} G
        </p>
        <div className="text-xs text-white/40 mt-1">G: {p.balance_g?.toFixed(2)} | A: {p.balance_a?.toFixed(2)}</div>
      </div>
    );
  };

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-10, 100];
    const vals = chartData.map(d => d.total_value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 5);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData]);

  if (loading) {
    return (
      <Card className="bg-[#0A0A0C] border-white/5">
        <CardContent className="p-8 flex justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const stats = data?.stats || {};
  const trend = stats.percent_change >= 0;

  return (
    <div className="space-y-4">
      {/* Stats Panel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={language === 'de' ? 'Aktuell' : 'Current'} value={stats.current} />
        <StatCard label="ATH" value={stats.all_time_high} color="green" icon={<ArrowUp className="w-3 h-3" />} />
        <StatCard label="ATL" value={stats.all_time_low} color="red" icon={<ArrowDown className="w-3 h-3" />} />
        <StatCard label={language === 'de' ? 'Spanne' : 'Range'} value={stats.range} color="purple" icon={<Activity className="w-3 h-3" />} />
        <StatCard 
          label={language === 'de' ? 'Änderung' : 'Change'} 
          value={`${trend ? '+' : ''}${stats.percent_change}%`} 
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
            <div className="flex gap-1 bg-black/30 rounded-lg p-1">
              {['hourly', 'daily', 'weekly'].map(tf => (
                <Button
                  key={tf}
                  variant={timeframe === tf ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeframe(tf)}
                  className={`h-8 px-3 ${timeframe === tf ? 'bg-primary text-black' : 'text-white/60'}`}
                >
                  {tf === 'hourly' && <Clock className="w-3 h-3 mr-1" />}
                  {tf === 'daily' && <Calendar className="w-3 h-3 mr-1" />}
                  {tf === 'weekly' && <CalendarDays className="w-3 h-3 mr-1" />}
                  {tf === 'hourly' ? (language === 'de' ? 'Stündlich' : 'Hourly') :
                   tf === 'daily' ? (language === 'de' ? 'Täglich' : 'Daily') :
                   (language === 'de' ? 'Wöchentlich' : 'Weekly')}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-white/40">
              {language === 'de' ? 'Noch keine Daten. Spiele um Daten zu generieren!' : 'No data yet. Play to generate data!'}
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
    </div>
  );
};

const StatCard = ({ label, value, color, icon, isPercent }) => {
  const colorClass = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-500' : color === 'purple' ? 'text-purple-400' : 'text-white';
  const borderClass = color === 'green' ? 'border-green-500/20' : color === 'red' ? 'border-red-500/20' : 'border-white/5';
  
  return (
    <Card className={`bg-[#0A0A0C] ${borderClass}`}>
      <CardContent className="p-3">
        <p className="text-white/40 text-xs mb-1 flex items-center gap-1">
          {icon && <span className={colorClass}>{icon}</span>}
          {label}
        </p>
        <p className={`font-bold text-lg font-mono ${colorClass}`}>
          {isPercent ? value : `${typeof value === 'number' ? value.toFixed(2) : value} G`}
        </p>
      </CardContent>
    </Card>
  );
};

export default AccountValueChart;
