import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Gamepad2, Sparkles, Trophy, Gift, Eye, EyeOff, MessageCircle } from 'lucide-react';
import Turnstile from '../components/Turnstile';
import { useCallback } from 'react';

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, login, register, loading: authLoading } = useAuth();
  const { t, language, changeLanguage, showLanguageToggle } = useLanguage();
  
  const [authTab, setAuthTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ password: '', confirmPassword: '', username: '' });
  
  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState(null);
  const handleTurnstileVerify = React.useCallback((token) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = React.useCallback((code) => {
    console.error('[Turnstile] Error:', code);
  }, []);

  const handleTurnstileExpire = React.useCallback(() => {
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);
  
  // Reset turnstile when switching tabs
  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Check Turnstile
    if (!turnstileToken) {
      toast.error(language === 'de' ? 'Bitte bestätige, dass du kein Roboter bist' : 'Please verify you are not a robot');
      return;
    }
    
    console.log('[Login] Submitting with token:', turnstileToken?.substring(0, 20) + '...');
    
    setLoading(true);
    try {
      await login(loginData.username, loginData.password, turnstileToken);
      toast.success(language === 'de' ? 'Erfolgreich angemeldet!' : 'Successfully logged in!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message);
      // Reset Turnstile on error
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (registerData.password.length < 6) {
      toast.error(language === 'de' ? 'Passwort muss mindestens 6 Zeichen haben' : 'Password must be at least 6 characters');
      return;
    }
    if (registerData.password !== registerData.confirmPassword) {
      toast.error(language === 'de' ? 'Passwörter stimmen nicht überein' : 'Passwords do not match');
      return;
    }
    
    // Check Turnstile
    if (!turnstileToken) {
      toast.error(language === 'de' ? 'Bitte bestätige, dass du kein Roboter bist' : 'Please verify you are not a robot');
      return;
    }
    
    console.log('[Register] Submitting with token:', turnstileToken?.substring(0, 20) + '...');
    
    setLoading(true);
    try {
      await register(registerData.username, registerData.password, turnstileToken);
      toast.success(language === 'de' ? 'Konto erstellt!' : 'Account created!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message);
      // Reset Turnstile on error
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[128px]" />

      {/* Language Toggle & Discord - Below 18+ banner */}
      <div className="absolute top-28 right-6 z-50 flex items-center gap-3">
        <a
          href="https://discord.gg/6hX8XJC2MP"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] transition-colors text-white font-bold shadow-lg shadow-[#5865F2]/30"
          data-testid="discord-button"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline">{language === 'de' ? 'Community beitreten' : 'Join Community'}</span>
          <span className="sm:hidden">Discord</span>
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={() => changeLanguage(language === 'en' ? 'de' : 'en')}
          className="border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-slate-900/80 backdrop-blur-sm"
          data-testid="landing-lang-toggle"
        >
          {language === 'en' ? 'DE' : 'EN'}
        </Button>
      </div>

      {/* Prominent 18+ Age Restriction Banner - Visible without scrolling w*/}
      <div className="relative z-20 w-full bg-amber-500/10 border-b border-amber-500/30 py-3">
        <div className="container mx-auto px-4 flex items-center justify-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 text-black font-bold text-lg shadow-lg shadow-amber-500/30">
            18+
          </div>
          <div className="text-center">
            <p className="text-amber-400 font-semibold text-lg">
              {language === 'de' ? 'Nur für Erwachsene ab 18 Jahren' : 'For Adults 18+ Only'}
            </p>
            <p className="text-amber-400/70 text-sm">
              {language === 'de' 
                ? 'Durch die Nutzung dieser Website bestätigst du, dass du mindestens 18 Jahre alt bist.'
                : 'By using this website, you confirm that you are at least 18 years old.'}
            </p>
          </div>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 text-black font-bold text-lg shadow-lg shadow-amber-500/30">
            18+
          </div>
        </div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Left Side - Hero Content */}
          <div className="text-left space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Retro Casino Simulation</span>
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
                <span className="text-white">Welcome to</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  {t('app_name')}
                </span>
              </h1>
              
              <p className="text-lg text-white/60 max-w-md">
                {language === 'de' 
                  ? 'Erlebe den Nervenkitzel von Casino-Spielen ohne echtes Geld. Reine Simulation, purer Spaß.'
                  : 'Experience the thrill of casino games without real money. Pure simulation, pure fun.'}
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel rounded-xl p-4 group hover:border-primary/50 transition-colors">
                <Gamepad2 className="w-8 h-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white">{t('slot_machine')}</h3>
                <p className="text-sm text-white/50">
                  {language === 'de' ? 'Klassische Casino Slots' : 'Classic casino slots'}
                </p>
              </div>
              
              <div className="glass-panel rounded-xl p-4 group hover:border-gold/50 transition-colors">
                <Gift className="w-8 h-8 text-gold mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white">{t('lucky_wheel')}</h3>
                <p className="text-sm text-white/50">
                  {language === 'de' ? 'Kostenlose Spins alle 5 Min' : 'Free spins every 5 min'}
                </p>
              </div>
              
              <div className="glass-panel rounded-xl p-4 group hover:border-secondary/50 transition-colors">
                <Trophy className="w-8 h-8 text-secondary mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white">{t('leaderboard')}</h3>
                <p className="text-sm text-white/50">
                  {language === 'de' ? 'Kämpfe um die Spitzenplätze' : 'Compete for top spots'}
                </p>
              </div>
              
              <div className="glass-panel rounded-xl p-4 group hover:border-accent/50 transition-colors">
                <Sparkles className="w-8 h-8 text-accent mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white">
                  {language === 'de' ? 'VIP Kosmetik' : 'VIP Cosmetics'}
                </h3>
                <p className="text-sm text-white/50">
                  {language === 'de' ? 'Passe dein Profil an' : 'Customize your profile'}
                </p>
              </div>
            </div>

            {/* Starting Balance */}
            <div className="inline-flex items-center space-x-3 px-6 py-3 rounded-xl bg-gold/10 border border-gold/30">
              <span className="text-gold font-mono text-2xl font-bold">10.00 G</span>
              <span className="text-gold/80">{t('')} {language === 'de' ? 'Neu Spieler Bonus' : 'New Player Welcome Boost'}</span>
            </div>
          </div>

          {/* Right Side - Auth Card */}
          <div className="lg:pl-8">
            <Card className="bg-[#0A0A0C]/80 border-white/5 backdrop-blur-xl shadow-2xl">
              <CardHeader className="text-center pb-2">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <span className="text-3xl font-bold text-black font-mono">G</span>
                </div>
                <CardTitle className="text-2xl text-white">{t('app_name')}</CardTitle>
                <CardDescription className="text-white/50">
                  {language === 'de' ? 'Anmelden oder Konto erstellen' : 'Sign in or create an account'}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-4">
                <Tabs value={authTab} onValueChange={setAuthTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/5">
                    <TabsTrigger 
                      value="login" 
                      className="data-[state=active]:bg-primary data-[state=active]:text-black"
                      data-testid="login-tab"
                    >
                      {t('login')}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="register"
                      className="data-[state=active]:bg-primary data-[state=active]:text-black"
                      data-testid="register-tab"
                    >
                      {t('register')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-4 mt-6">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-username" className="text-white/80">
                          {language === 'de' ? 'Benutzername' : 'Username'}
                        </Label>
                        <Input
                          id="login-username"
                          type="text"
                          value={loginData.username}
                          onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                          placeholder="CasinoKing"
                          required
                          className="bg-black/50 border-white/10 text-white placeholder:text-white/30"
                          data-testid="login-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-white/80">
                          {language === 'de' ? 'Passwort' : 'Password'}
                        </Label>
                        <div className="relative">
                          <Input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            placeholder="••••••••"
                            required
                            className="bg-black/50 border-white/10 text-white placeholder:text-white/30 pr-10"
                            data-testid="login-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      
                      {/* Cloudflare Turnstile */}
                      <div className="flex justify-center py-2">
                        <Turnstile
                          onVerify={handleTurnstileVerify}
                          onError={handleTurnstileError}
                          onExpire={handleTurnstileExpire}
                        />
                      </div>
                      
                      <Button
                        type="submit"
                        disabled={loading || !turnstileToken}
                        className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-wider disabled:opacity-50"
                        data-testid="login-submit-btn"
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                          t('login')
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register" className="space-y-4 mt-6">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-username" className="text-white/80">
                          {language === 'de' ? 'Benutzername' : 'Username'}
                        </Label>
                        <Input
                          id="register-username"
                          type="text"
                          value={registerData.username}
                          onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                          placeholder="CasinoKing"
                          required
                          minLength={3}
                          maxLength={20}
                          className="bg-black/50 border-white/10 text-white placeholder:text-white/30"
                          data-testid="register-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className="text-white/80">
                          {language === 'de' ? 'Passwort' : 'Password'}
                        </Label>
                        <div className="relative">
                          <Input
                            id="register-password"
                            type={showPassword ? 'text' : 'password'}
                            value={registerData.password}
                            onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className="bg-black/50 border-white/10 text-white placeholder:text-white/30 pr-10"
                            data-testid="register-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-confirm-password" className="text-white/80">
                          {language === 'de' ? 'Passwort bestätigen' : 'Confirm Password'}
                        </Label>
                        <div className="relative">
                          <Input
                            id="register-confirm-password"
                            type={showPassword ? 'text' : 'password'}
                            value={registerData.confirmPassword}
                            onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className={`bg-black/50 border-white/10 text-white placeholder:text-white/30 pr-10 ${
                              registerData.confirmPassword && registerData.password !== registerData.confirmPassword 
                                ? 'border-red-500/50' 
                                : registerData.confirmPassword && registerData.password === registerData.confirmPassword
                                  ? 'border-green-500/50'
                                  : ''
                            }`}
                            data-testid="register-confirm-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {registerData.confirmPassword && registerData.password !== registerData.confirmPassword && (
                          <p className="text-red-400 text-xs">
                            {language === 'de' ? 'Passwörter stimmen nicht überein' : 'Passwords do not match'}
                          </p>
                        )}
                      </div>
                      
                      {/* Cloudflare Turnstile */}
                      <div className="flex justify-center py-2">
                        <Turnstile
                          onVerify={handleTurnstileVerify}
                          onError={handleTurnstileError}
                          onExpire={handleTurnstileExpire}
                        />
                      </div>

                      <Button
                        type="submit"          
                        disabled={
                          loading || 
                          !turnstileToken || 
                          (registerData.confirmPassword && 
                            registerData.password !== registerData.confirmPassword)
                        }
                        className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-wider disabled:opacity-50"
                        data-testid="register-submit-btn"
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                          t('register')
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
