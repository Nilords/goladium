import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Trophy, 
  Crown, 
  Coins,
  Star,
  Gamepad2,
  Zap
} from 'lucide-react';



const Leaderboards = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  
  const [balanceLeaderboard, setBalanceLeaderboard] = useState([]);
  const [levelLeaderboard, setLevelLeaderboard] = useState([]);
  const [bigWinsLeaderboard, setBigWinsLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('balance');

  useEffect(() => {
    loadLeaderboards();
  }, []);

  const loadLeaderboards = async () => {
    try {
      const [balanceRes, levelRes, winsRes] = await Promise.all([
        fetch(`/api/leaderboards/balance?limit=25`),
        fetch(`/api/leaderboards/level?limit=25`),
        fetch(`/api/leaderboards/biggest-wins?limit=25`)
      ]);

      if (balanceRes.ok) setBalanceLeaderboard(await balanceRes.json());
      if (levelRes.ok) setLevelLeaderboard(await levelRes.json());
      if (winsRes.ok) setBigWinsLeaderboard(await winsRes.json());
    } catch (error) {
      console.error('Failed to load leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankStyle = (rank) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 border-yellow-500/50';
      case 2: return 'bg-gradient-to-r from-gray-400/20 to-gray-500/20 border-gray-400/50';
      case 3: return 'bg-gradient-to-r from-amber-600/20 to-amber-700/20 border-amber-600/50';
      default: return 'bg-white/5 border-white/10';
    }
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2: return <Crown className="w-5 h-5 text-gray-400" />;
      case 3: return <Crown className="w-5 h-5 text-amber-600" />;
      default: return <span className="text-white/40 font-mono text-sm">#{rank}</span>;
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Trophy className="w-8 h-8 text-gold" />
            {language === 'de' ? 'Bestenlisten' : 'Leaderboards'}
          </h1>
          <p className="text-white/50">
            {language === 'de' ? 'Top 25 Spieler in jeder Kategorie' : 'Top 25 players in each category'}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[#0A0A0C] border border-white/10 mb-6">
            <TabsTrigger 
              value="balance" 
              className="data-[state=active]:bg-gold/20 data-[state=active]:text-gold flex items-center gap-2"
            >
              <Coins className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'de' ? 'Höchstes Guthaben' : 'Highest Balance'}</span>
              <span className="sm:hidden">{language === 'de' ? 'Guthaben' : 'Balance'}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="level" 
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-2"
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'de' ? 'Höchstes Level' : 'Highest Level'}</span>
              <span className="sm:hidden">Level</span>
            </TabsTrigger>
            <TabsTrigger 
              value="wins" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'de' ? 'Größte Gewinne' : 'Biggest Wins'}</span>
              <span className="sm:hidden">{language === 'de' ? 'Gewinne' : 'Wins'}</span>
            </TabsTrigger>
          </TabsList>

          {/* Balance Leaderboard */}
          <TabsContent value="balance">
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader className="border-b border-white/5">
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Coins className="w-6 h-6 text-gold" />
                  {language === 'de' ? 'Top 25 nach Guthaben' : 'Top 25 by Balance'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : balanceLeaderboard.length === 0 ? (
                    <div className="text-center text-white/40 py-12">
                      {language === 'de' ? 'Noch keine Daten' : 'No data yet'}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {balanceLeaderboard.map((player) => (
                        <div 
                          key={player.user_id}
                          className={`flex items-center gap-4 p-4 border-l-2 ${getRankStyle(player.rank)} ${
                            player.user_id === user?.user_id ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div className="w-8 flex justify-center">
                            {getRankIcon(player.rank)}
                          </div>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={player.avatar} />
                            <AvatarFallback className="bg-primary/20 text-primary">
                              {player.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{player.username}</p>
                            <p className="text-white/40 text-sm">Level {player.level}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gold font-mono font-bold text-lg">
                              {player.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} G
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Level Leaderboard */}
          <TabsContent value="level">
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader className="border-b border-white/5">
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Star className="w-6 h-6 text-primary" />
                  {language === 'de' ? 'Top 25 nach Level (XP)' : 'Top 25 by Level (XP)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : levelLeaderboard.length === 0 ? (
                    <div className="text-center text-white/40 py-12">
                      {language === 'de' ? 'Noch keine Daten' : 'No data yet'}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {levelLeaderboard.map((player) => (
                        <div 
                          key={player.user_id}
                          className={`flex items-center gap-4 p-4 border-l-2 ${getRankStyle(player.rank)} ${
                            player.user_id === user?.user_id ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div className="w-8 flex justify-center">
                            {getRankIcon(player.rank)}
                          </div>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={player.avatar} />
                            <AvatarFallback className="bg-primary/20 text-primary">
                              {player.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{player.username}</p>
                            <p className="text-white/40 text-sm font-mono">{player.xp?.toLocaleString()} XP</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-primary/20 text-primary border-0 text-lg px-3 py-1">
                              Lv. {player.level}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Biggest Wins Leaderboard */}
          <TabsContent value="wins">
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader className="border-b border-white/5">
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Zap className="w-6 h-6 text-green-400" />
                  {language === 'de' ? 'Top 25 Größte Einzelgewinne' : 'Top 25 Biggest Single Wins'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : bigWinsLeaderboard.length === 0 ? (
                    <div className="text-center text-white/40 py-12">
                      <Zap className="w-12 h-12 text-white/20 mx-auto mb-4" />
                      <p>{language === 'de' ? 'Noch keine großen Gewinne' : 'No big wins yet'}</p>
                      <p className="text-sm mt-1">{language === 'de' ? 'Gewinne über 10 G werden hier angezeigt' : 'Wins over 10 G will appear here'}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {bigWinsLeaderboard.map((win) => (
                        <div 
                          key={win.win_id}
                          className={`flex items-center gap-4 p-4 border-l-2 ${getRankStyle(win.rank)} ${
                            win.user_id === user?.user_id ? 'bg-green-500/10' : ''
                          }`}
                        >
                          <div className="w-8 flex justify-center">
                            {getRankIcon(win.rank)}
                          </div>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={win.avatar} />
                            <AvatarFallback className="bg-green-500/20 text-green-400">
                              {win.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-medium truncate">{win.username}</p>
                              <Badge className={`text-xs border-0 ${
                                win.game_type === 'slot' ? 'bg-primary/20 text-primary' : 'bg-purple-500/20 text-purple-400'
                              }`}>
                                {win.game_type === 'slot' ? (
                                  <><Gamepad2 className="w-3 h-3 mr-1" />{win.slot_name || 'Slot'}</>
                                ) : (
                                  <><Trophy className="w-3 h-3 mr-1" />Jackpot</>
                                )}
                              </Badge>
                            </div>
                            <div className="text-white/40 text-xs space-x-2">
                              <span>{language === 'de' ? 'Einsatz' : 'Bet'}: {win.bet_amount} G</span>
                              {win.win_chance && (
                                <span>• {language === 'de' ? 'Chance' : 'Chance'}: {win.win_chance}%</span>
                              )}
                              <span>• {win.multiplier}x</span>
                            </div>
                            <p className="text-white/30 text-xs mt-1">{formatTimestamp(win.timestamp)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-green-400 font-mono font-bold text-lg">
                              +{win.win_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} G
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default Leaderboards;
