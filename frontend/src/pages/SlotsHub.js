import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ChevronRight, Sparkles } from 'lucide-react';



const SlotsHub = () => {
  const { user, token } = useAuth();
  const { t, language } = useLanguage();
  const [classicSlot, setClassicSlot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClassicSlot();
  }, []);

  const loadClassicSlot = async () => {
    try {
      const response = await fetch(`/api/games/slot/classic/info`);
      if (response.ok) {
        const data = await response.json();
        setClassicSlot(data);
      }
    } catch (error) {
      console.error('Failed to load slot:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't block rendering - show layout immediately with placeholder
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8 animate-fade-in text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            {t('slots') || 'Slot Machines'}
          </h1>
          <p className="text-white/50">
            {language === 'de' 
              ? 'Wähle deinen Lieblings-Spielautomaten'
              : 'Choose your favorite slot machine'}
          </p>
        </div>

        {/* Classic Fruits Slot - Single Featured Slot */}
        <div className="max-w-md mx-auto mb-12">
          <Link 
            to="/slots/classic"
            data-testid="slot-card-classic"
          >
            <Card className="game-card h-full overflow-hidden group cursor-pointer relative bg-gradient-to-br from-orange-500/20 to-yellow-500/20 hover:from-orange-500/30 hover:to-yellow-500/30 transition-all">
              <CardContent className="p-8 relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <span className="text-6xl">🍒</span>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className="text-yellow-400 bg-yellow-500/20 border-0">
                      {classicSlot?.volatility || 'medium'}
                    </Badge>
                    <span className="text-sm text-white/40">RTP {classicSlot?.rtp || 95.5}%</span>
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                  Classic Fruits
                </h3>
                
                <div className="flex items-center gap-4 text-sm text-white/50 mb-6">
                  <span>4x4 Grid</span>
                  <span>•</span>
                  <span>8 {language === 'de' ? 'Linien' : 'Lines'}</span>
                </div>

                {/* Features */}
                <div className="flex flex-wrap gap-2 mb-6">
                  <Badge className="bg-primary/20 text-primary border-0">Wild</Badge>
                  <Badge className="bg-green-500/20 text-green-400 border-0">Full Line Wins</Badge>
                </div>

                <Button className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-black font-bold group-hover:shadow-[0_0_20px_rgba(255,165,0,0.4)] transition-all">
                  {language === 'de' ? 'Spielen' : 'Play Now'}
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* More Coming Soon */}
        <div className="text-center py-16">
          <p className="text-4xl sm:text-5xl font-bold text-white/20">
            {language === 'de' ? 'Mehr kommt bald' : 'More coming soon'}
          </p>
        </div>

        {/* Info Box */}
        <Card className="mt-8 bg-[#0A0A0C] border-white/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/20">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {language === 'de' ? '' : ''}
                </h3>
                <p className="text-white/50 text-sm">
                  {language === 'de' 
                    ? ''
                    : ''}
                </p>
                <p className="text-red-400/80 text-xs mt-2">
                  {t('')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default SlotsHub;
