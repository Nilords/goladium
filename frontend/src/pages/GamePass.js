import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSound } from '../contexts/SoundContext';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import ChestOpening from '../components/ChestOpening';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
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
  Crown,
  Package,
  Box
} from 'lucide-react';

const DIFFICULTY_COLORS = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const GamePass = () => {
  const { token, refreshUser, user } = useAuth();
  const { language } = useLanguage();
  const { playChestOpen, playLevelUp, playWin, playClick } = useSound();
  const [gamePass, setGamePass] = useState(null);
  const [quests, setQuests] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingQuest, setClaimingQuest] = useState(null);
  const [claimingChest, setClaimingChest] = useState(false);
  
  // Chest opening state
  const [chestToOpen, setChestToOpen] = useState(null);
  const [showChestDialog, setShowChestDialog] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [passRes, questsRes, inventoryRes] = await Promise.all([
        fetch(`/api/game-pass`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/quests`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept-Language': language }
        }),
        fetch(`/api/inventory/${user?.user_id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (passRes.ok) setGamePass(await passRes.json());
      if (questsRes.ok) {
        const data = await questsRes.json();
        setQuests(data.quests || []);
      }
      if (inventoryRes.ok) {
        const data = await inventoryRes.json();
        setInventory(data.items || []);
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
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(language === 'de' ? `+${data.xp_earned} XP erhalten!` : `+${data.xp_earned} XP earned!`);
        await loadData();
        await refreshUser();
      }
    } catch (error) {
      console.error('Failed to claim quest:', error);
    } finally {
      setClaimingQuest(null);
    }
  };

  const claimAllChests = async () => {
    if (claimingChest) return;
    setClaimingChest(true);
    
    try {
      const res = await fetch(`/api/game-pass/claim-all-chests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          language === 'de' 
            ? `${data.chests_claimed} Truhen abgeholt!` 
            : `${data.chests_claimed} chests claimed!`
        );
        await loadData();
      }
    } catch (error) {
      console.error('Failed to claim chests:', error);
    } finally {
      setClaimingChest(false);
    }
  };

  const openChest = (chest) => {
    setChestToOpen(chest);
    setShowChestDialog(true);
  };

  const handleChestOpened = async (result) => {
    await loadData();
    await refreshUser();
    
    if (result.reward?.type === 'item') {
      toast.success('🎉 JACKPOT! Item Drop!');
    }
  };

  // Get chests from inventory
  const chests = inventory.filter(item => 
    item.item_id === 'gamepass_chest' || item.item_id === 'galadium_chest'
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-white/50">
            {language === 'de' ? 'Lädt...' : 'Loading...'}
          </div>
        </main>
      </div>
    );
  }

  const xpProgress = gamePass ? (gamePass.xp / gamePass.xp_to_next) * 100 : 0;
  const chestSystem = gamePass?.chest_system || {};
  const totalUnclaimed = chestSystem.total_unclaimed || 0;

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
              ? 'Schließe Quests ab, steige auf und öffne Truhen!'
              : 'Complete quests, level up and open chests!'}
          </p>
        </div>

        <Tabs defaultValue="pass" className="space-y-6">
          <TabsList className="bg-[#0A0A0C] border border-white/5">
            <TabsTrigger value="pass" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Trophy className="w-4 h-4 mr-2" />
              Game Pass
            </TabsTrigger>
            <TabsTrigger value="chests" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 relative">
              <Package className="w-4 h-4 mr-2" />
              {language === 'de' ? 'Truhen' : 'Chests'}
              {(totalUnclaimed > 0 || chests.length > 0) && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {totalUnclaimed + chests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quests" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Target className="w-4 h-4 mr-2" />
              Quests
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
                      <p className="text-white/50 text-sm">Pass Level</p>
                      <p className="text-white text-xl font-bold">
                        {gamePass?.xp || 0} / {gamePass?.xp_to_next || 150} XP
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white/50 text-sm">
                      {language === 'de' ? 'Truhen pro Level' : 'Chests per Level'}
                    </p>
                    <p className="text-yellow-400 font-bold">
                      {gamePass?.galadium_active ? '2' : '1'} 
                      <span className="text-white/50 font-normal ml-1">
                        {gamePass?.galadium_active && (
                          <Badge className="ml-2 bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                            +1 Galadium
                          </Badge>
                        )}
                      </span>
                    </p>
                  </div>
                </div>
                <Progress value={xpProgress} className="h-3 bg-white/5" />
                <p className="text-white/40 text-xs mt-2 text-center">
                  {language === 'de' 
                    ? 'Erhalte XP durch das Abschließen von Quests' 
                    : 'Earn XP by completing quests'}
                </p>
              </CardContent>
            </Card>

            {/* Chest Rewards Info */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Normal Chest */}
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <Package className="w-8 h-8 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium">GamePass Chest</h3>
                    <p className="text-white/50 text-sm">
                      {language === 'de' ? '1 pro Level • Für alle Spieler' : '1 per level • For all players'}
                    </p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    {chestSystem.unclaimed_normal?.length || 0} {language === 'de' ? 'verfügbar' : 'available'}
                  </Badge>
                </CardContent>
              </Card>

              {/* Galadium Chest */}
              <Card className={`border ${gamePass?.galadium_active ? 'bg-gradient-to-br from-[#0A0A0C] to-purple-900/20 border-purple-500/30' : 'bg-[#0A0A0C] border-white/5 opacity-60'}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${gamePass?.galadium_active ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/30' : 'bg-white/5'}`}>
                    <Crown className={`w-8 h-8 ${gamePass?.galadium_active ? 'text-purple-400' : 'text-white/30'}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-medium ${gamePass?.galadium_active ? 'text-white' : 'text-white/50'}`}>Galadium Chest</h3>
                    <p className="text-white/50 text-sm">
                      {gamePass?.galadium_active 
                        ? (language === 'de' ? '+1 Bonus pro Level' : '+1 Bonus per level')
                        : (language === 'de' ? 'Galadium Pass erforderlich' : 'Requires Galadium Pass')}
                    </p>
                  </div>
                  {gamePass?.galadium_active ? (
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {chestSystem.unclaimed_galadium?.length || 0} {language === 'de' ? 'verfügbar' : 'available'}
                    </Badge>
                  ) : (
                    <Lock className="w-5 h-5 text-white/30" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Claim All Button */}
            {totalUnclaimed > 0 && (
              <Button
                onClick={claimAllChests}
                disabled={claimingChest}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-6 text-lg"
              >
                <Gift className="w-5 h-5 mr-2" />
                {claimingChest 
                  ? '...' 
                  : language === 'de' 
                    ? `${totalUnclaimed} Truhe${totalUnclaimed > 1 ? 'n' : ''} abholen!`
                    : `Claim ${totalUnclaimed} Chest${totalUnclaimed > 1 ? 's' : ''}!`}
              </Button>
            )}
          </TabsContent>

          {/* Chests Tab */}
          <TabsContent value="chests" className="space-y-6">
            {/* Unclaimed Chests Section */}
            {totalUnclaimed > 0 && (
              <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-yellow-400" />
                    {language === 'de' ? 'Nicht abgeholte Truhen' : 'Unclaimed Chests'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 mb-4">
                    {language === 'de' 
                      ? `Du hast ${totalUnclaimed} Truhe${totalUnclaimed > 1 ? 'n' : ''} zum Abholen!`
                      : `You have ${totalUnclaimed} chest${totalUnclaimed > 1 ? 's' : ''} to claim!`}
                  </p>
                  <Button
                    onClick={claimAllChests}
                    disabled={claimingChest}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold"
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    {claimingChest ? '...' : language === 'de' ? 'Alle abholen' : 'Claim All'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Inventory Chests */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-yellow-400" />
                  {language === 'de' ? 'Deine Truhen' : 'Your Chests'}
                  {chests.length > 0 && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 ml-2">{chests.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chests.length === 0 ? (
                  <div className="text-center py-8 text-white/40">
                    <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{language === 'de' ? 'Keine Truhen im Inventar' : 'No chests in inventory'}</p>
                    <p className="text-sm mt-1">
                      {language === 'de' 
                        ? 'Schließe Quests ab, um Truhen zu erhalten!'
                        : 'Complete quests to earn chests!'}
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {chests.map((chest) => (
                      <div 
                        key={chest.inventory_id}
                        className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-105 ${
                          chest.item_id === 'galadium_chest' 
                            ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30 hover:border-purple-400'
                            : 'bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30 hover:border-yellow-400'
                        }`}
                        onClick={() => openChest(chest)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            chest.item_id === 'galadium_chest' 
                              ? 'bg-purple-500/20' 
                              : 'bg-yellow-500/20'
                          }`}>
                            {chest.item_id === 'galadium_chest' 
                              ? <Crown className="w-6 h-6 text-purple-400" />
                              : <Package className="w-6 h-6 text-yellow-400" />
                            }
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{chest.item_name}</p>
                            <Badge className={`text-xs mt-1 ${
                              chest.item_id === 'galadium_chest'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {chest.item_rarity}
                            </Badge>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          className={`w-full mt-3 ${
                            chest.item_id === 'galadium_chest'
                              ? 'bg-purple-600 hover:bg-purple-500'
                              : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                          }`}
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {language === 'de' ? 'Öffnen' : 'Open'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Drop Rates Info */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-white/50" />
                  {language === 'de' ? 'Drop-Wahrscheinlichkeiten' : 'Drop Rates'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-gray-500/10 border border-gray-500/20 text-center">
                    <p className="text-gray-400 font-mono text-lg">80%</p>
                    <p className="text-white/50 text-xs">5-15 G</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                    <p className="text-green-400 font-mono text-lg">15%</p>
                    <p className="text-white/50 text-xs">16-40 G</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
                    <p className="text-purple-400 font-mono text-lg">4%</p>
                    <p className="text-white/50 text-xs">41-100 G</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                    <p className="text-yellow-400 font-mono text-lg">1%</p>
                    <p className="text-white/50 text-xs">Shop Item!</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quests Tab */}
          <TabsContent value="quests" className="space-y-6">
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
                          onClaim={() => claimQuestReward(quest.quest_id)}
                          claiming={claimingQuest === quest.quest_id}
                          language={language}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {quests.length === 0 && (
              <Card className="bg-[#0A0A0C] border-white/5">
                <CardContent className="p-8 text-center">
                  <Target className="w-12 h-12 mx-auto mb-3 text-white/20" />
                  <p className="text-white/50">
                    {language === 'de' ? 'Keine aktiven Quests' : 'No active quests'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Chat />

      {/* Chest Opening Dialog */}
      <ChestOpening
        isOpen={showChestDialog}
        onClose={() => {
          setShowChestDialog(false);
          setChestToOpen(null);
        }}
        chestItem={chestToOpen}
        onChestOpened={handleChestOpened}
      />
    </div>
  );
};

// Quest Card Component
const QuestCard = ({ quest, onClaim, claiming, language }) => {
  const progress = quest.current_progress || 0;
  const target = quest.target_value || 1;
  const progressPercent = Math.min((progress / target) * 100, 100);
  const isComplete = progress >= target;
  const canClaim = isComplete && !quest.claimed;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      quest.claimed 
        ? 'bg-white/5 border-white/10 opacity-60'
        : canClaim
          ? 'bg-primary/10 border-primary/30'
          : 'bg-white/[0.02] border-white/5'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-white font-medium">{quest.title}</p>
            {quest.claimed && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          </div>
          <p className="text-white/50 text-sm mb-2">{quest.description}</p>
          
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <Progress value={progressPercent} className="h-2 flex-1 bg-white/5" />
            <span className="text-white/50 text-xs font-mono min-w-[60px] text-right">
              {progress}/{target}
            </span>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <Badge className="bg-primary/20 text-primary border-primary/30">
            +{quest.xp_reward} XP
          </Badge>
          
          {canClaim && (
            <Button 
              size="sm"
              onClick={onClaim}
              disabled={claiming}
              className="bg-primary hover:bg-primary/80 text-black"
            >
              {claiming ? '...' : language === 'de' ? 'Abholen' : 'Claim'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePass;
