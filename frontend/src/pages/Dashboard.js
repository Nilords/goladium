import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatCurrencyFull } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Gamepad2, 
  CircleDot, 
  Trophy, 
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronRight,
  Star,
  Zap,
  Clock,
  Users,
  BarChart3,
  ShoppingBag,
  Coins,
  Gift,
  Lock,
  CheckCircle2,
  Target,
  Crown,
  Info,
  ExternalLink,
  MessageCircle,
  Package,
  Box
} from 'lucide-react';

const Dashboard = () => {
  const { user, token, refreshUser, updateUserBalance } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentBets, setRecentBets] = useState([]);
  const [wheelStatus, setWheelStatus] = useState({ can_spin: true, seconds_remaining: 0 });
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  
  // Game Pass & Quests state
  const [gamePass, setGamePass] = useState(null);
  const [questSlots, setQuestSlots] = useState([]);
  const [questsInfo, setQuestsInfo] = useState({ 
    quests_until_a_chance: 0, 
    daily_a_earned: 0, 
    daily_a_limit: 5
  });
  const [claimingQuest, setClaimingQuest] = useState(null);
  const [claimingReward, setClaimingReward] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // Update every second for countdown timers
    const interval = setInterval(() => {
      updateWheelCountdown();
      // Decrement quest slot cooldowns locally
      setQuestSlots(prev => prev.map(slot => {
        if (slot.status === 'cooldown' && slot.remaining_seconds > 0) {
          const newSeconds = slot.remaining_seconds - 1;
          if (newSeconds <= 0) {
            // Reload data when cooldown expires
            loadDashboardData();
            return slot;
          }
          return {
            ...slot,
            remaining_seconds: newSeconds,
            remaining_minutes: Math.ceil(newSeconds / 60)
          };
        }
        return slot;
      }));
    }, 1000);
    const dataInterval = setInterval(loadDashboardData, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(dataInterval);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      const [leaderboardRes, historyRes, wheelRes, slotsRes, passRes, questsRes] = await Promise.all([
        fetch(`/api/leaderboard?limit=5`),
        fetch(`/api/user/history?limit=5`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }),
        fetch(`/api/games/wheel/status`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }),
        fetch(`/api/games/slots`),
        fetch(`/api/game-pass`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        }),
        fetch(`/api/quests`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept-Language': language
          },
          credentials: 'include'
        })
      ]);

      if (leaderboardRes.ok) setLeaderboard(await leaderboardRes.json());
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        // API returns {items: [...], total: ...} - extract the items array
        setRecentBets(Array.isArray(historyData) ? historyData : (historyData.items || []));
      }
      if (wheelRes.ok) setWheelStatus(await wheelRes.json());
      if (slotsRes.ok) setSlots(await slotsRes.json());
      if (passRes.ok) setGamePass(await passRes.json());
      if (questsRes.ok) {
        const questsData = await questsRes.json();
        setQuestSlots(questsData.slots || []);
        setQuestsInfo({
          quests_until_a_chance: questsData.quests_until_a_chance || 0,
          daily_a_earned: questsData.daily_a_earned || 0,
          daily_a_limit: questsData.daily_a_limit || 5
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateWheelCountdown = () => {
    setWheelStatus(prev => {
      if (prev.seconds_remaining > 0) {
        const newSeconds = prev.seconds_remaining - 1;
        return {
          ...prev,
          seconds_remaining: newSeconds,
          can_spin: newSeconds <= 0
        };
      }
      return prev;
    });
  };

  // Quest claim handler
  const claimQuestReward = async (questId) => {
    if (claimingQuest) return;
    setClaimingQuest(questId);
    
    try {
      const res = await fetch(`/api/quests/${questId}/claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });

      if (res.ok) {
        await loadDashboardData();
        await refreshUser();
      }
    } catch (error) {
      console.error('Failed to claim quest:', error);
    } finally {
      setClaimingQuest(null);
    }
  };

  // Game Pass reward claim handler
  const claimPassReward = async (level) => {
    if (claimingReward) return;
    setClaimingReward(level);
    
    try {
      const res = await fetch(`/api/game-pass/claim/${level}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });

      if (res.ok) {
        await loadDashboardData();
        await refreshUser();
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
    } finally {
      setClaimingReward(null);
    }
  };

  const spinWheel = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (wheelSpinning || !wheelStatus.can_spin) return;
    
    setWheelSpinning(true);
    try {
      const response = await fetch(`/api/games/wheel/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        updateUserBalance(result.new_balance);
        setWheelStatus({
          can_spin: false,
          seconds_remaining: 300,
          next_spin_available: result.next_spin_available
        });
        // Show success notification would go here
      }
    } catch (error) {
      console.error('Wheel spin failed:', error);
    } finally {
      setWheelSpinning(false);
    }
  };

  const calculateXpProgress = () => {
    if (!user) return 0;
    const xpForCurrentLevel = 100 * Math.pow(1.5, (user.level || 1) - 1);
    const xpForNextLevel = 100 * Math.pow(1.5, user.level || 1);
    const xpInCurrentLevel = Math.max(0, (user.xp || 0) - xpForCurrentLevel);
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    return Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeeded) * 100));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Welcome Section */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            {language === 'de' ? 'Willkommen zurück,' : 'Welcome back,'}{' '}
            <span className="text-primary">{user?.username}</span>
          </h1>
          <p className="text-white/50">
            {language === 'de' ? 'Bereit für ein Spiel?' : 'Ready to play?'}
          </p>
        </div>

        {/* Discord Community Banner - Prominent */}
        <a 
          href="https://discord.gg/6hX8XJC2MP" 
          target="_blank" 
          rel="noopener noreferrer"
          className="block mb-8 group"
          data-testid="discord-community-banner"
        >
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#5865F2] via-[#4752C4] to-[#5865F2] p-[2px] animate-pulse-slow">
            <div className="relative bg-[#0A0A0C] rounded-2xl p-5 overflow-hidden">
              {/* Animated background effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#5865F2]/10 via-[#5865F2]/20 to-[#5865F2]/10 animate-shimmer" />
              <div className="absolute top-0 left-0 w-32 h-32 bg-[#5865F2]/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#5865F2]/20 rounded-full blur-3xl" />
              
              <div className="relative flex flex-col sm:flex-row items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-[#5865F2] flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-[#5865F2]/50">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl font-bold text-white mb-1 flex items-center justify-center sm:justify-start gap-2">
                    {language === 'de' ? 'Tritt unserer Community bei!' : 'Join our Community!'}
                    <Sparkles className="w-5 h-5 text-[#5865F2]" />
                  </h3>
                  <p className="text-white/70 text-sm">
                    {language === 'de' 
                      ? 'Teile Erfahrungen • Finde Trading-Partner • Tausche dich aus'
                      : 'Share experiences • Find trading partners • Connect with players'}
                  </p>
                </div>
                <Button className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold px-6 shadow-lg shadow-[#5865F2]/30 group-hover:shadow-[#5865F2]/50 transition-all">
                  <Users className="w-4 h-4 mr-2" />
                  {language === 'de' ? 'Beitreten' : 'Join'}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </a>

        {/* Stats Overview - Reduced balance emphasis */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">{t('level')}</span>
                <Star className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-white">{user?.level || 1}</span>
                <Progress value={calculateXpProgress()} className="mt-2 h-1" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">{t('balance')}</span>
                <Sparkles className="w-4 h-4 text-white/40" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-mono text-white/80" data-testid="dashboard-balance">
                  {formatCurrency(user?.balance)} G
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">{t('total_spins')}</span>
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-white">{user?.total_spins || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-sm">{t('net_profit')}</span>
                {(user?.net_profit || 0) >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
              </div>
              <div className="mt-2">
                <span className={`text-xl font-mono ${
                  (user?.net_profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {(user?.net_profit || 0) >= 0 ? '+' : ''}{user?.net_profit?.toFixed(2) || '0.00'} G
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Games Grid - Slots and Jackpot only (Lucky Wheel moved to navbar) */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Slot Machine Card - Direct link to classic slot */}
          <Link to="/slots/classic" data-testid="slot-machine-card">
            <Card className="game-card h-full overflow-hidden group cursor-pointer relative">
              <CardContent className="p-6 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-primary/20 group-hover:bg-primary/30 transition-colors">
                    <Gamepad2 className="w-8 h-8 text-primary" />
                  </div>
                  <Badge className="bg-primary/20 text-primary border-0">
                    4x4 Grid
                  </Badge>
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-2">{t('slot_machine')}</h3>
                <p className="text-white/50 mb-6">
                  {language === 'de' 
                    ? '8 Gewinnlinien • Echte Casino-Mechanik'
                    : '8 Paylines • Real Casino Mechanics'}
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {['🍒', '📖', '💎', '🤖', '⚔️'].map((emoji, i) => (
                    <span 
                      key={i} 
                      className="w-12 h-12 rounded-lg bg-black/50 flex items-center justify-center text-2xl"
                    >
                      {emoji}
                    </span>
                  ))}
                </div>

                <Button className="w-full bg-primary hover:bg-primary/90 text-black font-bold uppercase group-hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-shadow">
                  {language === 'de' ? 'Jetzt spielen' : 'Play Now'}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </Link>

          {/* Jackpot Card */}
          <Link to="/jackpot" data-testid="jackpot-card">
            <Card className="game-card h-full overflow-hidden group cursor-pointer relative bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-purple-500/20 hover:border-purple-500/40 transition-colors">
              <CardContent className="p-6 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                    <Users className="w-8 h-8 text-purple-400" />
                  </div>
                  <Badge className="bg-purple-500/20 text-purple-400 border-0">
                    PvP
                  </Badge>
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-2">{t('jackpot') || 'Jackpot'}</h3>
                <p className="text-white/50 mb-6">
                  {language === 'de' 
                    ? 'Spieler vs. Spieler - Gewinne den gesamten Pot!'
                    : 'Player vs Player - Win the entire pot!'}
                </p>

                <div className="bg-black/30 rounded-lg p-4 mb-6">
                  <div className="text-center">
                    <span className="text-white/60 text-sm">
                      {language === 'de' ? 'Gewinnchance = Dein Einsatz' : 'Win Chance = Your Contribution'}
                    </span>
                  </div>
                </div>

                <Button className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-shadow">
                  {language === 'de' ? 'Mitspielen' : 'Join Game'}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Game Pass & Quests Section */}
        <Card className="bg-[#0A0A0C] border-white/5 mb-8" data-testid="game-pass-section">
          <CardContent className="p-6">
            <Tabs defaultValue="quests" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-primary" />
                  <h2 className="text-xl font-bold text-white">Game Pass</h2>
                </div>
                <TabsList className="bg-black/30 border border-white/5">
                  <TabsTrigger value="quests" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-sm">
                    <Target className="w-4 h-4 mr-1" />
                    Quests
                  </TabsTrigger>
                  <TabsTrigger value="pass" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-sm">
                    <Gift className="w-4 h-4 mr-1" />
                    {language === 'de' ? 'Belohnungen' : 'Rewards'}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Pass Level Progress */}
              {gamePass && (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-black/20 border border-white/5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-cyan-500/30 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">{gamePass.level}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white/60">Pass Level {gamePass.level}</span>
                      <span className="text-primary">{gamePass.xp} / {gamePass.xp_to_next} XP</span>
                    </div>
                    <Progress value={(gamePass.xp / gamePass.xp_to_next) * 100} className="h-2" />
                  </div>
                  {gamePass.next_reward_level && (
                    <div className="text-right hidden sm:block">
                      <span className="text-white/40 text-xs">{language === 'de' ? 'Nächste Belohnung' : 'Next Reward'}</span>
                      <p className="text-primary font-bold text-sm">Level {gamePass.next_reward_level}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quests Tab */}
              <TabsContent value="quests" className="mt-4">
                <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {questSlots.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-white/40">
                        {language === 'de' ? 'Lade Quests...' : 'Loading quests...'}
                      </p>
                    </div>
                  ) : (
                    questSlots.map((slot) => {
                      // Cooldown slot - show timer
                      if (slot.status === 'cooldown') {
                        const minutes = Math.floor(slot.remaining_seconds / 60);
                        const seconds = slot.remaining_seconds % 60;
                        return (
                          <div 
                            key={`slot-${slot.slot_index}`}
                            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-center"
                          >
                            <div className="text-center">
                              <Clock className="w-6 h-6 mx-auto text-primary/50 mb-2" />
                              <p className="text-2xl font-mono text-primary">
                                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                              </p>
                              <p className="text-xs text-white/40 mt-1">
                                {language === 'de' ? 'Neue Quest verfügbar in' : 'New quest available in'}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      
                      // Empty slot
                      if (!slot.quest) {
                        return (
                          <div 
                            key={`slot-${slot.slot_index}`}
                            className="p-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01] flex items-center justify-center min-h-[100px]"
                          >
                            <p className="text-white/30 text-sm">
                              {language === 'de' ? 'Quest-Slot frei' : 'Quest slot empty'}
                            </p>
                          </div>
                        );
                      }
                      
                      // Active quest
                      const quest = slot.quest;
                      const progress = Math.min(100, (quest.current / quest.target) * 100);
                      const diffColor = quest.difficulty === 'easy' 
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : quest.difficulty === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/30';
                      
                      return (
                        <div 
                          key={quest.quest_id}
                          className={`p-4 rounded-xl border transition-all ${
                            quest.completed 
                              ? quest.claimed 
                                ? 'bg-white/5 border-white/10 opacity-50'
                                : 'bg-green-500/10 border-green-500/30'
                              : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                          }`}
                          data-testid={`quest-${quest.quest_id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge className={`${diffColor} border text-xs`}>
                                  {quest.difficulty === 'easy' 
                                    ? (language === 'de' ? 'Einfach' : 'Easy')
                                    : quest.difficulty === 'medium'
                                      ? (language === 'de' ? 'Mittel' : 'Medium')
                                      : (language === 'de' ? 'Schwer' : 'Hard')}
                                </Badge>
                                <h4 className="font-medium text-white text-sm">{quest.name}</h4>
                                {quest.completed && !quest.claimed && (
                                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-white/50 mb-2">{quest.description}</p>
                              
                              {/* Progress */}
                              <div className="mb-2">
                                <div className="flex justify-between text-xs text-white/50 mb-1">
                                  <span>{quest.current} / {quest.target}</span>
                                  <span>{Math.round(progress)}%</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                              </div>
                              
                              {/* Rewards */}
                              <div className="flex flex-wrap gap-1.5">
                                {quest.rewards.xp && (
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs py-0">
                                    <Zap className="w-3 h-3 mr-1" />+{quest.rewards.xp} XP
                                  </Badge>
                                )}
                                {quest.rewards.g && (
                                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs py-0">
                                    <Coins className="w-3 h-3 mr-1" />+{quest.rewards.g} G
                                  </Badge>
                                )}
                                {quest.rewards.a && (
                                  <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs py-0">
                                    <Star className="w-3 h-3 mr-1" />+{quest.rewards.a} A
                                  </Badge>
                                )}
                                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs py-0">
                                  <Trophy className="w-3 h-3 mr-1" />+{quest.game_pass_xp} Pass
                                </Badge>
                              </div>
                            </div>
                            
                            {quest.completed && !quest.claimed && (
                              <Button
                                size="sm"
                                onClick={() => claimQuestReward(quest.quest_id)}
                                disabled={claimingQuest === quest.quest_id}
                                className="bg-green-600 hover:bg-green-500 text-white text-xs flex-shrink-0"
                                data-testid={`claim-quest-${quest.quest_id}`}
                              >
                                {claimingQuest === quest.quest_id ? '...' : language === 'de' ? 'Abholen' : 'Claim'}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                {/* Quest Info Box */}
                <div className="mt-3 space-y-2">
                  {/* A-Currency Status */}
                  <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span className="text-white/70 text-xs">
                        {questsInfo.quests_until_a_chance > 0 
                          ? (language === 'de' 
                            ? `Noch ${questsInfo.quests_until_a_chance} Quest(s) bis zur A-Chance`
                            : `${questsInfo.quests_until_a_chance} quest(s) until A chance`)
                          : (language === 'de'
                            ? 'A-Währung Quests verfügbar!'
                            : 'A currency quests available!')}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs">
                      {questsInfo.daily_a_earned} / {questsInfo.daily_a_limit} A {language === 'de' ? 'heute' : 'today'}
                    </Badge>
                  </div>
                  
                  {/* Requirements Info */}
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5 flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-white/50 text-xs">
                      {language === 'de' 
                        ? 'Min. 5 G Einsatz (Slots) • Min. 20 G Pot (Jackpot-Gewinne)'
                        : 'Min. 5 G bet (slots) • Min. 20 G pot (jackpot wins)'}
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* Chests Tab - NEW CHEST SYSTEM */}
              <TabsContent value="pass" className="mt-4">
                <div className="space-y-4">
                  {/* Chest Info Cards */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* GamePass Chest */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                          <Package className="w-6 h-6 text-yellow-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-white font-medium">GamePass Chest</h4>
                          <p className="text-white/50 text-xs">
                            {language === 'de' ? '1 pro Level • Für alle' : '1 per level • For everyone'}
                          </p>
                        </div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          {gamePass?.chest_system?.unclaimed_normal?.length || 0} {language === 'de' ? 'verfügbar' : 'available'}
                        </Badge>
                      </div>
                    </div>

                    {/* Galadium Chest */}
                    <div className={`p-4 rounded-xl border ${
                      gamePass?.galadium_active 
                        ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30' 
                        : 'bg-white/[0.02] border-white/10 opacity-60'
                    }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          gamePass?.galadium_active ? 'bg-purple-500/20' : 'bg-white/10'
                        }`}>
                          <Crown className={`w-6 h-6 ${gamePass?.galadium_active ? 'text-purple-400' : 'text-white/30'}`} />
                        </div>
                        <div className="flex-1">
                          <h4 className={`font-medium ${gamePass?.galadium_active ? 'text-white' : 'text-white/50'}`}>
                            Galadium Chest
                          </h4>
                          <p className="text-white/50 text-xs">
                            {gamePass?.galadium_active 
                              ? (language === 'de' ? '+1 Bonus pro Level' : '+1 bonus per level')
                              : (language === 'de' ? 'Galadium Pass erforderlich' : 'Requires Galadium Pass')}
                          </p>
                        </div>
                        {gamePass?.galadium_active ? (
                          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                            {gamePass?.chest_system?.unclaimed_galadium?.length || 0} {language === 'de' ? 'verfügbar' : 'available'}
                          </Badge>
                        ) : (
                          <Lock className="w-5 h-5 text-white/30" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Drop Rates Info */}
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-white/40" />
                      <span className="text-white/60 text-xs font-medium">
                        {language === 'de' ? 'Drop-Wahrscheinlichkeiten' : 'Drop Rates'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-xs">80% → 5-15 G</Badge>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">15% → 16-40 G</Badge>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">4% → 41-100 G</Badge>
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">1% → Item!</Badge>
                    </div>
                  </div>

                  {/* Link to Full GamePass Page */}
                  <Link to="/game-pass">
                    <Button className="w-full bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/80 hover:to-cyan-500/80 text-black font-bold">
                      <Package className="w-4 h-4 mr-2" />
                      {language === 'de' ? 'Truhen öffnen & verwalten' : 'Open & Manage Chests'}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Bottom Section */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Leaderboards Tile - Links to dedicated page */}
          <Link to="/leaderboards">
            <Card className="bg-[#0A0A0C] border-white/5 hover:border-gold/30 transition-all cursor-pointer group h-full">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[200px]">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/20 to-yellow-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-8 h-8 text-gold" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {language === 'de' ? 'Bestenlisten' : 'Leaderboards'}
                </h3>
                <p className="text-white/50 text-sm mb-4">
                  {language === 'de' 
                    ? 'Top 25 nach Guthaben, Level & größten Gewinnen' 
                    : 'Top 25 by Balance, Level & Biggest Wins'}
                </p>
                <div className="flex items-center gap-4 text-white/40 text-xs">
                  <span className="flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-gold" />
                    {language === 'de' ? 'Guthaben' : 'Balance'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-primary" />
                    Level
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-green-400" />
                    {language === 'de' ? 'Gewinne' : 'Wins'}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-gold mt-4 group-hover:translate-x-1 transition-transform" />
              </CardContent>
            </Card>
          </Link>

          {/* Recent Activity */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  {language === 'de' ? 'Letzte Aktivität' : 'Recent Activity'}
                </CardTitle>
                <Link to="/profile" className="text-primary text-sm hover:underline">
                  {language === 'de' ? 'Alle anzeigen' : 'View All'}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {recentBets.length === 0 ? (
                    <div className="text-center text-white/40 py-8">
                      {language === 'de' ? 'Noch keine Aktivität' : 'No activity yet'}
                    </div>
                  ) : (
                    recentBets.map((bet) => {
                      // Determine display values based on transaction_type
                      const transactionType = bet.transaction_type;
                      const amount = bet.amount ?? bet.net_outcome ?? 0;
                      const isWin = transactionType === 'win' || amount > 0;
                      const isBet = transactionType === 'bet';
                      
                      // Get appropriate label
                      let label = '';
                      if (transactionType === 'bet') {
                        label = language === 'de' ? 'Einsatz' : 'Bet';
                      } else if (transactionType === 'win') {
                        label = language === 'de' ? 'Gewinn' : 'Win';
                      } else if (bet.game_type === 'wheel') {
                        label = language === 'de' ? 'Glücksrad' : 'Wheel';
                      } else if (bet.game_type === 'item_purchase') {
                        label = bet.details?.item_name || 'Item';
                      } else if (bet.game_type === 'item_sale') {
                        label = language === 'de' ? 'Verkauf' : 'Sale';
                      } else {
                        label = bet.game_type === 'slot' ? 'Slots' : 
                                bet.game_type === 'jackpot' ? 'Jackpot' : 
                                bet.game_type;
                      }
                      
                      // Determine icon and color
                      let iconBg = 'bg-primary/20';
                      let IconComponent = Gamepad2;
                      let iconColor = 'text-primary';
                      
                      if (transactionType === 'win') {
                        iconBg = 'bg-green-500/20';
                        IconComponent = TrendingUp;
                        iconColor = 'text-green-400';
                      } else if (transactionType === 'bet') {
                        iconBg = bet.game_type === 'jackpot' ? 'bg-purple-500/20' : 'bg-red-500/20';
                        IconComponent = bet.game_type === 'jackpot' ? Trophy : Gamepad2;
                        iconColor = bet.game_type === 'jackpot' ? 'text-purple-400' : 'text-red-400';
                      } else if (bet.game_type === 'jackpot') {
                        iconBg = 'bg-purple-500/20';
                        IconComponent = Trophy;
                        iconColor = 'text-purple-400';
                      } else if (bet.game_type === 'item_purchase') {
                        iconBg = 'bg-blue-500/20';
                        IconComponent = ShoppingBag;
                        iconColor = 'text-blue-400';
                      } else if (bet.game_type === 'item_sale') {
                        iconBg = 'bg-green-500/20';
                        IconComponent = Coins;
                        iconColor = 'text-green-400';
                      } else if (bet.game_type === 'wheel') {
                        iconBg = 'bg-gold/20';
                        IconComponent = CircleDot;
                        iconColor = 'text-gold';
                      }
                      
                      return (
                        <div 
                          key={bet.bet_id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
                              <IconComponent className={`w-4 h-4 ${iconColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm flex items-center gap-2">
                                {label}
                                {bet.details?.slot_name && (
                                  <span className="text-white/40 text-xs">
                                    ({bet.details.slot_name})
                                  </span>
                                )}
                              </p>
                              <p className="text-white/40 text-xs">
                                {new Date(bet.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <span className={`font-mono text-sm ${
                            amount >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {amount >= 0 ? '+' : ''}{amount.toFixed(2)} G
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default Dashboard;
