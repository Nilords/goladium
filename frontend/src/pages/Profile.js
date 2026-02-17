import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatCurrencyFull } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import AccountValueChart from '../components/AccountValueChart';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table';
import { 
  Activity,
  History, 
  TrendingUp, 
  TrendingDown,
  Gamepad2,
  CircleDot,
  Star,
  Crown,
  Heart,
  Diamond,
  Sparkles,
  BarChart3,
  Settings,
  Upload,
  ImageIcon,
  X,
  ShoppingBag,
  Coins
} from 'lucide-react';



const Profile = () => {
  const { user, token, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    // Refresh user data to get latest XP/level
    if (refreshUser) refreshUser();
    loadProfileData();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory(historyPage);
    }
  }, [historyPage, activeTab]);

  const loadProfileData = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch(`/api/user/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }),
        fetch(`/api/user/history?limit=100&page=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData.items || []);
        setHistoryTotal(historyData.total || 0);
        setHistoryTotalPages(historyData.total_pages || 0);
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (page) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/user/history?limit=100&page=${page}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.items || []);
        setHistoryTotal(data.total || 0);
        setHistoryTotalPages(data.total_pages || 0);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Level XP requirements matching backend
  const LEVEL_XP_REQUIREMENTS = [
    0, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700,
    6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300, 19200, 21200,
  ];

  const calculateXpProgress = () => {
    if (!user) return { progress: 0, current: 0, needed: 500, totalXp: 0 };
    
    // Use xp_progress from backend if available
    if (user.xp_progress) {
      return {
        progress: user.xp_progress.progress_percent || 0,
        current: user.xp_progress.xp_into_level || 0,
        needed: user.xp_progress.xp_needed_for_next || 500,
        totalXp: user.xp_progress.current_xp || 0
      };
    }
    
    // Fallback calculation if backend doesn't provide xp_progress
    const currentLevel = user.level || 1;
    const totalXp = user.xp || 0;
    
    // Calculate cumulative XP for current level
    let cumulativeForCurrentLevel = 0;
    for (let i = 1; i < currentLevel && i < LEVEL_XP_REQUIREMENTS.length; i++) {
      cumulativeForCurrentLevel += LEVEL_XP_REQUIREMENTS[i];
    }
    
    // XP needed for next level
    const xpNeededForNext = currentLevel < LEVEL_XP_REQUIREMENTS.length 
      ? LEVEL_XP_REQUIREMENTS[currentLevel] 
      : Math.floor(LEVEL_XP_REQUIREMENTS[LEVEL_XP_REQUIREMENTS.length - 1] * 1.1);
    
    // XP earned within current level
    const xpIntoLevel = Math.max(0, totalXp - cumulativeForCurrentLevel);
    
    // Progress percentage
    const progress = xpNeededForNext > 0 
      ? Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForNext) * 100))
      : 0;
    
    return {
      progress: progress,
      current: xpIntoLevel,
      needed: xpNeededForNext,
      totalXp: totalXp
    };
  };

  const xpInfo = calculateXpProgress();

  const getBadgeIcon = (badge) => {
    switch (badge) {
      case 'vip': return <Crown className="w-4 h-4" />;
      case 'supporter': return <Heart className="w-4 h-4" />;
      case 'veteran': return <Star className="w-4 h-4" />;
      case 'whale': return <Diamond className="w-4 h-4" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <Card className="bg-[#0A0A0C] border-white/5 mb-8 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5" />
          <CardContent className="p-8 relative">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Avatar */}
              <div className="relative">
                <Avatar className={`h-24 w-24 border-4 ${
                  user?.frame === 'gold' ? 'border-gold' :
                  user?.frame === 'neon' ? 'border-primary' :
                  user?.frame === 'diamond' ? 'border-white' :
                  'border-white/20'
                }`}>
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="text-3xl bg-primary/20 text-primary">
                    {user?.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {user?.vip_status && (
                  <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-gold shadow-lg">
                    <Crown className="w-4 h-4 text-black" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <h1 
                    className="text-2xl font-bold"
                    style={{ color: user?.name_color || '#EDEDED' }}
                  >
                    {user?.username}
                  </h1>
                  {user?.badge && (
                    <Badge className="bg-gold/20 text-gold border-0">
                      {getBadgeIcon(user.badge)}
                      <span className="ml-1 capitalize">{user.badge}</span>
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center justify-center md:justify-start gap-4 text-white/60 text-sm mb-4">
                  <span>{t('level')} {user?.level || 1}</span>
                  <span>•</span>
                  <span>{language === 'de' ? 'Beigetreten' : 'Joined'} {new Date(user?.created_at).toLocaleDateString()}</span>
                </div>

                {/* XP Progress - Enhanced display */}
                <div className="max-w-sm mx-auto md:mx-0 space-y-2">
                  {/* Total XP */}
                  <div className="text-center md:text-left">
                    <span className="text-xs text-white/40">{language === 'de' ? 'Gesamt XP' : 'Total XP'}: </span>
                    <span className="text-sm font-mono text-primary">{xpInfo.totalXp?.toLocaleString() || 0}</span>
                  </div>
                  
                  {/* Level Progress Bar */}
                  <div>
                    <div className="flex justify-between text-sm text-white/60 mb-1">
                      <span>{language === 'de' ? 'Level Fortschritt' : 'Level Progress'}</span>
                      <span className="font-mono">
                        {Math.floor(xpInfo.current).toLocaleString()} / {Math.floor(xpInfo.needed).toLocaleString()} XP
                      </span>
                    </div>
                    <Progress value={xpInfo.progress} className="h-2.5" />
                    <div className="flex justify-between text-xs text-white/40 mt-1">
                      <span>{xpInfo.progress.toFixed(1)}%</span>
                      <span>
                        {language === 'de' ? 'Noch' : 'Remaining'}: {Math.floor(xpInfo.needed - xpInfo.current).toLocaleString()} XP
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance - Reduced emphasis */}
              <div className="text-center p-4 rounded-xl bg-black/30 border border-white/10">
                <p className="text-white/50 text-sm mb-1">{t('balance')}</p>
                <p className="text-2xl font-mono text-white/80">
                  {formatCurrency(user?.balance)}
                  <span className="text-sm text-white/40 ml-1">G</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs - Fixed with proper value binding */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[#0A0A0C] border border-white/5 mb-6 h-12">
            <TabsTrigger 
              value="stats" 
              className="data-[state=active]:bg-primary data-[state=active]:text-black h-full"
              data-testid="stats-tab"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {language === 'de' ? 'Statistiken' : 'Statistics'}
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-primary data-[state=active]:text-black h-full"
              data-testid="history-tab"
            >
              <History className="w-4 h-4 mr-2" />
              {t('history')}
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="data-[state=active]:bg-primary data-[state=active]:text-black h-full"
              data-testid="analytics-tab"
            >
              <Activity className="w-4 h-4 mr-2" />
              {language === 'de' ? 'Analyse' : 'Analytics'}
            </TabsTrigger>
          </TabsList>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="mt-0">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/50 text-sm">{t('total_spins')}</span>
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-white">{stats?.overall?.total_spins || 0}</p>
                </CardContent>
              </Card>

              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/50 text-sm">{t('total_wagered') || 'Total Wagered'}</span>
                    <Gamepad2 className="w-4 h-4 text-gold" />
                  </div>
                  <p className="text-2xl font-bold font-mono text-gold">
                    {stats?.overall?.total_wagered?.toFixed(2) || '0.00'}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/50 text-sm">{t('net_profit')}</span>
                    {(stats?.overall?.net_profit || 0) >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <p className={`text-2xl font-bold font-mono ${
                    (stats?.overall?.net_profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {(stats?.overall?.net_profit || 0) >= 0 ? '+' : ''}
                    {stats?.overall?.net_profit?.toFixed(2) || '0.00'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Game-specific Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Always show Slots card */}
              {(() => {
                const slotStats = Object.entries(stats?.by_game || {}).find(([key, gs]) => gs.game_type === 'slot');
                const slotData = slotStats ? slotStats[1] : null;
                return (
                  <Card className="bg-[#0A0A0C] border-white/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-white flex items-center gap-2">
                        <Gamepad2 className="w-5 h-5 text-primary" />
                        {slotData?.slot_name || t('slot_machine')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Einsätze' : 'Total Bets'}</span>
                        <span className="text-white font-mono">{slotData?.total_bets || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewettet' : 'Wagered'}</span>
                        <span className="text-gold font-mono">{(slotData?.total_wagered || 0).toFixed(2)} G</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewonnen' : 'Won'}</span>
                        <span className="text-green-500 font-mono">{(slotData?.total_won || 0).toFixed(2)} G</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewinnrate' : 'Win Rate'}</span>
                        <span className="text-primary font-mono">{slotData?.win_rate || 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Always show Jackpot card */}
              {(() => {
                const jackpotStats = Object.entries(stats?.by_game || {}).find(([key, gs]) => gs.game_type === 'jackpot');
                const jackpotData = jackpotStats ? jackpotStats[1] : null;
                return (
                  <Card className="bg-[#0A0A0C] border-white/5 border-purple-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-purple-400" />
                        Jackpot
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Einsätze' : 'Total Bets'}</span>
                        <span className="text-white font-mono">{jackpotData?.total_bets || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewettet' : 'Wagered'}</span>
                        <span className="text-gold font-mono">{(jackpotData?.total_wagered || 0).toFixed(2)} G</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewonnen' : 'Won'}</span>
                        <span className="text-green-500 font-mono">{(jackpotData?.total_won || 0).toFixed(2)} G</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">{language === 'de' ? 'Gewinnrate' : 'Win Rate'}</span>
                        <span className="text-purple-400 font-mono">{jackpotData?.win_rate || 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-0">
            <Card className="bg-[#0A0A0C] border-white/5">
              {/* History Header */}
              <CardHeader className="border-b border-white/10 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-white/60 text-sm">
                    {language === 'de' ? 'Letzte 7 Tage' : 'Last 7 days'} • {historyTotal} {language === 'de' ? 'Einträge' : 'entries'}
                  </p>
                  {historyLoading && (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-white/60">{language === 'de' ? 'Datum' : 'Date'}</TableHead>
                        <TableHead className="text-white/60">{language === 'de' ? 'Spiel' : 'Game'}</TableHead>
                        <TableHead className="text-white/60 text-right">{t('bet')}</TableHead>
                        <TableHead className="text-white/60 text-right">{language === 'de' ? 'Ergebnis' : 'Result'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-white/40 py-8">
                            {language === 'de' ? 'Noch keine Aktivität' : 'No activity yet'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        history
                          .filter(bet => bet.game_type !== 'wheel') // Filter out Lucky Wheel
                          .map((bet, idx) => (
                          <TableRow key={bet.bet_id || idx} className="border-white/5">
                            <TableCell className="text-white/60 text-sm">
                              {new Date(bet.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {bet.game_type === 'slot' ? (
                                  <Gamepad2 className="w-4 h-4 text-primary" />
                                ) : bet.game_type === 'jackpot' ? (
                                  <Trophy className="w-4 h-4 text-purple-400" />
                                ) : bet.game_type === 'item_purchase' ? (
                                  <ShoppingBag className="w-4 h-4 text-blue-400" />
                                ) : bet.game_type === 'item_sale' ? (
                                  <Coins className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Gamepad2 className="w-4 h-4 text-primary" />
                                )}
                                <span className="text-white capitalize">
                                  {bet.game_type === 'slot' ? (bet.slot_id || 'Slot') : 
                                   bet.game_type === 'jackpot' ? 'Jackpot' : 
                                   bet.game_type === 'item_purchase' ? (bet.details?.item_name || 'Item') :
                                   bet.game_type === 'item_sale' ? (bet.details?.item_name || 'Item') :
                                   'Slot'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-white/60">
                              {bet.game_type === 'item_purchase' ? (
                                <span className="text-blue-400">{language === 'de' ? 'Kauf' : 'Buy'}</span>
                              ) : bet.game_type === 'item_sale' ? (
                                <span className="text-green-400">{language === 'de' ? 'Verkauf' : 'Sell'}</span>
                              ) : bet.bet_amount > 0 ? (
                                `${bet.bet_amount.toFixed(2)} G`
                              ) : '-'}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${
                              bet.net_outcome >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {bet.net_outcome >= 0 ? '+' : ''}{bet.net_outcome?.toFixed(2) || '0.00'} G
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                
                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-white/10">
                    <p className="text-white/40 text-sm">
                      {language === 'de' ? 'Seite' : 'Page'} {historyPage} / {historyTotalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                        disabled={historyPage <= 1 || historyLoading}
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        {language === 'de' ? 'Zurück' : 'Previous'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                        disabled={historyPage >= historyTotalPages || historyLoading}
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        {language === 'de' ? 'Weiter' : 'Next'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="mt-0">
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-white/60 w-16">#</TableHead>
                        <TableHead className="text-white/60">{language === 'de' ? 'Spieler' : 'Player'}</TableHead>
                        <TableHead className="text-white/60 text-right">{t('level')}</TableHead>
                        <TableHead className="text-white/60 text-right">{t('total_wins')}</TableHead>
                        <TableHead className="text-white/60 text-right">{t('net_profit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.map((player, index) => (
                        <TableRow 
                          key={player.user_id} 
                          className={`border-white/5 ${
                            player.user_id === user?.user_id ? 'bg-primary/10' : ''
                          }`}
                        >
                          <TableCell>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0 ? 'bg-gold/20 text-gold' :
                              index === 1 ? 'bg-white/20 text-white' :
                              index === 2 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-white/10 text-white/60'
                            }`}>
                              {index + 1}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={player.avatar} />
                                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                  {player.username?.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-white font-medium">{player.username}</span>
                              {player.vip_status && (
                                <Crown className="w-4 h-4 text-gold" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-white font-mono">
                            {player.level}
                          </TableCell>
                          <TableCell className="text-right text-green-500 font-mono">
                            {player.total_wins}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${
                            player.net_profit >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {player.net_profit >= 0 ? '+' : ''}{player.net_profit.toFixed(2)} G
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
      <Chat />
    </div>
  );
};

export default Profile;
