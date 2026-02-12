import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import LiveWinFeed from '../components/LiveWinFeed';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { CircleDot, Clock, Sparkles, Gift, Zap } from 'lucide-react';



const WHEEL_SEGMENTS = [
  { value: 1, color: '#1a1a1a', probability: '75%' },
  { value: 5, color: '#7000FF', probability: '24%' },
  { value: 1, color: '#1a1a1a', probability: '75%' },
  { value: 5, color: '#7000FF', probability: '24%' },
  { value: 1, color: '#1a1a1a', probability: '75%' },
  { value: 15, color: '#FFD700', probability: '1%' },
  { value: 1, color: '#1a1a1a', probability: '75%' },
  { value: 5, color: '#7000FF', probability: '24%' },
];

const LuckyWheel = () => {
  const { user, token, updateUserBalance, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wheelStatus, setWheelStatus] = useState({ can_spin: true, seconds_remaining: 0 });
  const [lastReward, setLastReward] = useState(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    checkWheelStatus();
    const interval = setInterval(checkWheelStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (wheelStatus.seconds_remaining > 0) {
      setCountdown(wheelStatus.seconds_remaining);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            checkWheelStatus();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [wheelStatus.seconds_remaining]);

  const checkWheelStatus = async () => {
    try {
      const response = await fetch(`/api/games/wheel/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setWheelStatus(data);
      }
    } catch (error) {
      console.error('Failed to check wheel status:', error);
    }
  };

  const spinWheel = async () => {
    if (spinning || !wheelStatus.can_spin) return;

    setSpinning(true);
    setLastReward(null);

    try {
      const response = await fetch(`/api/games/wheel/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Spin failed');
      }

      const result = await response.json();
      
      // Calculate target rotation based on reward
      // The pointer is at top (0 degrees). We need to rotate the wheel so the winning segment lands there.
      const segmentAngle = 360 / WHEEL_SEGMENTS.length; // 45 degrees per segment
      
      // Find which segment index matches the reward
      let targetSegment;
      if (result.reward === 15) {
        targetSegment = 5; // Jackpot segment (index 5 in WHEEL_SEGMENTS)
      } else if (result.reward === 5) {
        // Pick one of the 5G segments randomly for visual variety
        const fiveGSegments = [1, 3, 7];
        targetSegment = fiveGSegments[Math.floor(Math.random() * fiveGSegments.length)];
      } else {
        // Pick one of the 1G segments randomly for visual variety
        const oneGSegments = [0, 2, 4, 6];
        targetSegment = oneGSegments[Math.floor(Math.random() * oneGSegments.length)];
      }

      // Calculate the rotation needed to land on the target segment
      // Segment N's center is at: N * segmentAngle + segmentAngle/2 degrees from top
      // To bring it to the pointer (top), we rotate by: 360 - (N * segmentAngle + segmentAngle/2)
      const segmentCenterAngle = (targetSegment * segmentAngle) + (segmentAngle / 2);
      const landingRotation = 360 - segmentCenterAngle;
      
      // Add multiple full spins for dramatic effect, plus the landing rotation
      const extraRotations = 5 + Math.floor(Math.random() * 3); // 5-7 full rotations
      const targetRotation = rotation + (extraRotations * 360) + landingRotation;
      
      setRotation(targetRotation);

      // Wait for animation to complete
      setTimeout(() => {
        setSpinning(false);
        setLastReward(result.reward);
        updateUserBalance(result.new_balance);
        checkWheelStatus();

        if (result.reward === 15) {
          toast.success(
            `🎉 ${language === 'de' ? 'JACKPOT!' : 'JACKPOT!'} +${result.reward} G!`,
            { duration: 5000 }
          );
        } else {
          toast.success(`+${result.reward} G!`);
        }
      }, 5000);

    } catch (error) {
      setSpinning(false);
      toast.error(error.message);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-4xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            {t('lucky_wheel')}
          </h1>
          <p className="text-white/50">
            {language === 'de' 
              ? 'Drehe alle 5 Minuten kostenlos und gewinne Goladium!'
              : 'Spin every 5 minutes for free and win Goladium!'}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Wheel */}
          <div className="lg:col-span-2">
            <Card className="bg-[#0A0A0C] border-white/5 overflow-hidden">
              <CardContent className="p-8">
                {/* Wheel Container */}
                <div className="relative w-full max-w-[400px] mx-auto aspect-square">
                  {/* Outer Glow */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 blur-xl animate-pulse" />
                  
                  {/* Wheel Frame */}
                  <div className="relative w-full h-full rounded-full border-8 border-[#333] shadow-2xl bg-[#1a1a1a] overflow-hidden">
                    {/* Spinning Wheel */}
                    <div 
                      className="absolute inset-2 rounded-full overflow-hidden"
                      style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: spinning ? 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
                      }}
                    >
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        {WHEEL_SEGMENTS.map((segment, index) => {
                          const angle = (360 / WHEEL_SEGMENTS.length) * index;
                          const startAngle = (angle - 90) * (Math.PI / 180);
                          const endAngle = (angle + 360 / WHEEL_SEGMENTS.length - 90) * (Math.PI / 180);
                          
                          const x1 = 50 + 50 * Math.cos(startAngle);
                          const y1 = 50 + 50 * Math.sin(startAngle);
                          const x2 = 50 + 50 * Math.cos(endAngle);
                          const y2 = 50 + 50 * Math.sin(endAngle);
                          
                          const largeArc = 360 / WHEEL_SEGMENTS.length > 180 ? 1 : 0;
                          
                          return (
                            <g key={index}>
                              <path
                                d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                fill={segment.color}
                                stroke="#333"
                                strokeWidth="0.5"
                              />
                              <text
                                x={50 + 30 * Math.cos((angle + 360 / WHEEL_SEGMENTS.length / 2 - 90) * Math.PI / 180)}
                                y={50 + 30 * Math.sin((angle + 360 / WHEEL_SEGMENTS.length / 2 - 90) * Math.PI / 180)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={segment.value === 15 ? '#000' : '#fff'}
                                fontSize="8"
                                fontWeight="bold"
                                fontFamily="Space Grotesk, monospace"
                              >
                                {segment.value}G
                              </text>
                            </g>
                          );
                        })}
                        {/* Center Circle */}
                        <circle cx="50" cy="50" r="10" fill="#0A0A0C" stroke="#444" strokeWidth="2" />
                        <text
                          x="50"
                          y="50"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#FFD700"
                          fontSize="6"
                          fontWeight="bold"
                        >
                          G
                        </text>
                      </svg>
                    </div>
                  </div>

                  {/* Pointer */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                    <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-primary drop-shadow-lg" />
                  </div>

                  {/* Decorative Lights */}
                  {[...Array(12)].map((_, i) => {
                    const angle = (i * 30 - 90) * (Math.PI / 180);
                    const x = 50 + 48 * Math.cos(angle);
                    const y = 50 + 48 * Math.sin(angle);
                    return (
                      <div
                        key={i}
                        className={`absolute w-3 h-3 rounded-full ${
                          spinning ? 'bg-primary animate-pulse' : 'bg-primary/30'
                        }`}
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: 'translate(-50%, -50%)',
                          animationDelay: `${i * 0.1}s`
                        }}
                      />
                    );
                  })}
                </div>

                {/* Result Display */}
                {lastReward !== null && (
                  <div className="mt-6 text-center animate-bounce-win">
                    <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full ${
                      lastReward === 15 
                        ? 'bg-gold/20 border border-gold/50' 
                        : lastReward === 5 
                          ? 'bg-secondary/20 border border-secondary/50'
                          : 'bg-white/10 border border-white/20'
                    }`}>
                      <Gift className={`w-5 h-5 ${
                        lastReward === 15 ? 'text-gold' : lastReward === 5 ? 'text-secondary' : 'text-white'
                      }`} />
                      <span className={`text-2xl font-bold font-mono ${
                        lastReward === 15 ? 'text-gold' : lastReward === 5 ? 'text-secondary' : 'text-white'
                      }`}>
                        +{lastReward} G
                      </span>
                      {lastReward === 15 && (
                        <Sparkles className="w-5 h-5 text-gold" />
                      )}
                    </div>
                  </div>
                )}

                {/* Spin Button */}
                <div className="mt-8">
                  {wheelStatus.can_spin ? (
                    <Button
                      onClick={spinWheel}
                      disabled={spinning}
                      className={`
                        w-full h-16 text-xl font-bold uppercase tracking-widest
                        transition-all duration-300 border-2
                        ${spinning 
                          ? 'bg-gray-700 text-gray-300 border-gray-600 cursor-not-allowed' 
                          : 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 text-black border-yellow-300 hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] hover:scale-[1.02]'
                        }
                      `}
                      data-testid="wheel-spin-btn"
                    >
                      {spinning ? (
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-6 h-6 border-3 border-gray-400 border-t-white rounded-full animate-spin" />
                          <span>{language === 'de' ? 'Dreht...' : 'Spinning...'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-3">
                          <Zap className="w-6 h-6" />
                          <span>{language === 'de' ? 'Kostenlos drehen' : 'Spin Free'}</span>
                        </div>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <Button
                        disabled
                        className="w-full h-16 text-xl font-bold uppercase bg-gray-800 text-gray-400 border-2 border-gray-700"
                      >
                        <Clock className="w-6 h-6 mr-3" />
                        {formatTime(countdown)}
                      </Button>
                      <Progress 
                        value={((300 - countdown) / 300) * 100} 
                        className="h-2"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Balance Card */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardContent className="p-6">
                <div className="text-center">
                  <p className="text-white/50 text-sm mb-1">{t('balance')}</p>
                  <p className="text-4xl font-bold font-mono text-gold animate-gold-pulse" data-testid="wheel-balance">
                    {formatCurrency(user?.balance)}
                    <span className="text-lg text-gold/60 ml-2">G</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Rewards Info */}
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-gold" />
                  {language === 'de' ? 'Belohnungen' : 'Rewards'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gold/10 border border-gold/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-gold" />
                    <span className="text-gold font-bold">15 G</span>
                  </div>
                  <Badge className="bg-gold/20 text-gold border-0">1%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/10 border border-secondary/30">
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-5 h-5 text-secondary" />
                    <span className="text-secondary font-bold">5 G</span>
                  </div>
                  <Badge className="bg-secondary/20 text-secondary border-0">24%</Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-5 h-5 text-white/60" />
                    <span className="text-white font-bold">1 G</span>
                  </div>
                  <Badge className="bg-white/10 text-white/60 border-0">75%</Badge>
                </div>

                <div className="pt-4 border-t border-white/10 text-center">
                  <p className="text-white/40 text-sm">
                    {language === 'de' 
                      ? 'Nächster Spin alle 5 Minuten'
                      : 'Next spin every 5 minutes'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
      <LiveWinFeed />
      <Chat />
    </div>
  );
};

export default LuckyWheel;
