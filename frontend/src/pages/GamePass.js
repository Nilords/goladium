import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Trophy, 
  Star, 
  Gift, 
  Lock, 
  CheckCircle2, 
  Sparkles,
  Target,
  Zap,
  Coins,
  ChevronRight,
  Info,
  ExternalLink,
  Crown
} from 'lucide-react';



const DIFFICULTY_COLORS = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const GamePass = () => {
  const { token, refreshUser } = useAuth();
  const { language } = useLanguage();
  const [gamePass, setGamePass] = useState(null);
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingQuest, setClaimingQuest] = useState(null);
  const [claimingReward, setClaimingReward] = useState(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [passRes, questsRes] = await Promise.all([
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

      if (passRes.ok) setGamePass(await passRes.json());
      if (questsRes.ok) {
        const data = await questsRes.json();
        setQuests(data.quests || []);
      }
    } catch (error) {
      console.error('Failed to load game pass data:', error);
    } finally {
      setLoading(false);
    }
  };

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
        await loadData();
        await refreshUser();
      }
    } catch (error) {
      console.error('Failed to claim quest:', error);
    } finally {
      setClaimingQuest(null);
    }
  };

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
        await loadData();
        await refreshUser();
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
    } finally {
      setClaimingReward(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-white/50">
            {language === 'de' ? 'Lädt...' : 'Loading...'}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const xpProgress = gamePass ? (gamePass.xp / gamePass.xp_to_next) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" />
            Game Pass
          </h1>
          <p className="text-white/50">
            {language === 'de' 
              ? 'Schließe Quests ab und steige im Pass auf!'
              : 'Complete quests and level up your pass!'}
          </p>
        </div>

        <Tabs defaultValue="pass" className="space-y-6">
          <TabsList className="bg-[#0A0A0C] border border-white/5">
            <TabsTrigger value="pass" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Trophy className="w-4 h-4 mr-2" />
              Game Pass
            </TabsTrigger>
            <TabsTrigger value="quests" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Target className="w-4 h-4 mr-2" />
              {language === 'de' ? 'Quests' : 'Quests'}
            </TabsTrigger>
          </TabsList>

          {/* Game Pass Tab */}
          <TabsContent value="pass" className="space-y-6">
            {/* Level Progress Card */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/30 flex items-center justify-center">
                      <span className="text-3xl font-bold text-primary">{gamePass?.level || 1}</span>
                    </div>
                    <div>
                      <p className="text-white/50 text-sm">
                        {language === 'de' ? 'Pass Level' : 'Pass Level'}
                      </p>
                      <p className="text-white text-xl font-bold">
                        {gamePass?.xp || 0} / {gamePass?.xp_to_next || 150} XP
                      </p>
                    </div>
                  </div>
                  {gamePass?.next_reward_level && (
                    <div className="text-right">
                      <p className="text-white/50 text-sm">
                        {language === 'de' ? 'Nächste Belohnung' : 'Next Reward'}
                      </p>
                      <p className="text-primary font-bold">Level {gamePass.next_reward_level}</p>
                    </div>
                  )}
                </div>
                <Progress value={xpProgress} className="h-3 bg-white/5" />
              </CardContent>
            </Card>

            {/* Reward Tracks */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Free Track */}
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-white/60" />
                    {language === 'de' ? 'Standard Track' : 'Standard Track'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {gamePass?.all_rewards && Object.entries(gamePass.all_rewards).map(([level, rewards]) => {
                        const levelNum = parseInt(level);
                        const isUnlocked = (gamePass?.level || 1) >= levelNum;
                        const isClaimed = gamePass?.rewards_claimed?.includes(levelNum);
                        const canClaim = isUnlocked && !isClaimed && !gamePass?.galadium_active;
                        
                        return (
                          <div 
                            key={level}
                            className={`p-4 rounded-xl border transition-all ${
                              isUnlocked 
                                ? isClaimed 
                                  ? 'bg-white/5 border-white/10 opacity-60' 
                                  : 'bg-primary/10 border-primary/30 hover:border-primary/50'
                                : 'bg-white/[0.02] border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  isUnlocked ? 'bg-primary/20' : 'bg-white/10'
                                }`}>
                                  {isClaimed ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                                  ) : isUnlocked ? (
                                    <Gift className="w-5 h-5 text-primary" />
                                  ) : (
                                    <Lock className="w-5 h-5 text-white/30" />
                                  )}
                                </div>
                                <div>
                                  <p className={`font-medium ${isUnlocked ? 'text-white' : 'text-white/50'}`}>
                                    Level {level}
                                  </p>
                                  <p className="text-sm text-white/50">{rewards.free.name}</p>
                                </div>
                              </div>
                              {canClaim && (
                                <Button 
                                  size="sm"
                                  onClick={() => claimPassReward(levelNum)}
                                  disabled={claimingReward === levelNum}
                                  className="bg-primary hover:bg-primary/80 text-black"
                                >
                                  {claimingReward === levelNum ? '...' : language === 'de' ? 'Abholen' : 'Claim'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Galadium Track */}
              <Card className="bg-gradient-to-br from-[#0A0A0C] to-purple-900/10 border-purple-500/20">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <Crown className="w-5 h-5 text-purple-400" />
                      Galadium Pass
                    </CardTitle>
                    {!gamePass?.galadium_active && (
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                        {language === 'de' ? 'Bald verfügbar' : 'Coming soon'}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {gamePass?.all_rewards && Object.entries(gamePass.all_rewards).map(([level, rewards]) => {
                        const levelNum = parseInt(level);
                        const isUnlocked = (gamePass?.level || 1) >= levelNum;
                        const isClaimed = gamePass?.rewards_claimed?.includes(levelNum);
                        const canClaim = isUnlocked && !isClaimed && gamePass?.galadium_active;
                        const isGaladiumActive = gamePass?.galadium_active;
                        
                        return (
                          <div 
                            key={level}
                            className={`p-4 rounded-xl border transition-all ${
                              isGaladiumActive
                                ? isUnlocked 
                                  ? isClaimed 
                                    ? 'bg-white/5 border-white/10 opacity-60' 
                                    : 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/50'
                                  : 'bg-white/[0.02] border-white/5'
                                : 'bg-white/[0.02] border-white/5 opacity-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  isGaladiumActive && isUnlocked ? 'bg-purple-500/20' : 'bg-white/10'
                                }`}>
                                  {isClaimed && isGaladiumActive ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                                  ) : isGaladiumActive && isUnlocked ? (
                                    <Sparkles className="w-5 h-5 text-purple-400" />
                                  ) : (
                                    <Lock className="w-5 h-5 text-white/30" />
                                  )}
                                </div>
                                <div>
                                  <p className={`font-medium ${isGaladiumActive && isUnlocked ? 'text-white' : 'text-white/50'}`}>
                                    Level {level}
                                  </p>
                                  <p className="text-sm text-purple-300/70">{rewards.galadium.name}</p>
                                </div>
                              </div>
                              {canClaim && (
                                <Button 
                                  size="sm"
                                  onClick={() => claimPassReward(levelNum)}
                                  disabled={claimingReward === levelNum}
                                  className="bg-purple-600 hover:bg-purple-500 text-white"
                                >
                                  {claimingReward === levelNum ? '...' : language === 'de' ? 'Abholen' : 'Claim'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* More Info */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-primary" />
                  <span className="text-white/70">
                    {language === 'de' 
                      ? 'Fragen zum Game Pass? Tritt unserer Community bei!'
                      : 'Questions about Game Pass? Join our community!'}
                  </span>
                </div>
                <a 
                  href="https://discord.gg/6hX8XJC2MP" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  Discord
                  <ExternalLink className="w-4 h-4" />
                </a>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quests Tab */}
          <TabsContent value="quests" className="space-y-6">
            {/* Quest Categories */}
            <div className="grid gap-4">
              {['easy', 'medium', 'hard'].map((difficulty) => {
                const difficultyQuests = quests.filter(q => q.difficulty === difficulty);
                if (difficultyQuests.length === 0) return null;

                return (
                  <Card key={difficulty} className="bg-[#0A0A0C] border-white/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-white flex items-center gap-2">
                        <Badge className={`${DIFFICULTY_COLORS[difficulty]} border`}>
                          {difficulty === 'easy' 
                            ? (language === 'de' ? 'Einfach' : 'Easy')
                            : difficulty === 'medium'
                              ? (language === 'de' ? 'Mittel' : 'Medium')
                              : (language === 'de' ? 'Schwer' : 'Hard')}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {difficultyQuests.map((quest) => (
                          <QuestCard 
                            key={quest.quest_id}
                            quest={quest}
                            language={language}
                            onClaim={() => claimQuestReward(quest.quest_id)}
                            isClaiming={claimingQuest === quest.quest_id}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Quest Info */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-white/70 text-sm space-y-1">
                    <p>
                      {language === 'de' 
                        ? 'Quests geben XP, G und manchmal A Währung.'
                        : 'Quests reward XP, G, and sometimes A currency.'}
                    </p>
                    <p className="text-white/50">
                      {language === 'de'
                        ? 'A Belohnungen sind limitiert: max 5/Tag, 2 Quest Cooldown zwischen A Belohnungen.'
                        : 'A rewards are limited: max 5/day, 2 quest cooldown between A rewards.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
      <LiveWinFeed />
      <Chat />
    </div>
  );
};

const QuestCard = ({ quest, language, onClaim, isClaiming }) => {
  const progress = Math.min(100, (quest.current / quest.target) * 100);
  
  return (
    <div className={`p-4 rounded-xl border transition-all ${
      quest.completed 
        ? quest.claimed 
          ? 'bg-white/5 border-white/10 opacity-60'
          : 'bg-green-500/10 border-green-500/30'
        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-white truncate">{quest.name}</h4>
            {quest.completed && !quest.claimed && (
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-white/50 mb-3">{quest.description}</p>
          
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>{quest.current} / {quest.target}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {/* Rewards */}
          <div className="flex flex-wrap gap-2">
            {quest.rewards.xp && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                <Zap className="w-3 h-3 mr-1" />
                +{quest.rewards.xp} XP
              </Badge>
            )}
            {quest.rewards.g && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                <Coins className="w-3 h-3 mr-1" />
                +{quest.rewards.g} G
              </Badge>
            )}
            {quest.rewards.a && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                <Star className="w-3 h-3 mr-1" />
                +{quest.rewards.a} A
              </Badge>
            )}
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
              <Trophy className="w-3 h-3 mr-1" />
              +{quest.game_pass_xp} Pass XP
            </Badge>
          </div>
        </div>
        
        {/* Claim Button */}
        {quest.completed && !quest.claimed && (
          <Button
            size="sm"
            onClick={onClaim}
            disabled={isClaiming}
            className="bg-green-600 hover:bg-green-500 text-white flex-shrink-0"
          >
            {isClaiming ? '...' : language === 'de' ? 'Abholen' : 'Claim'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default GamePass;
