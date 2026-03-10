import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSound } from '../contexts/SoundContext';
import Navbar from '../components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Slider } from '../components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { toast } from 'sonner';
import { 
  Settings as SettingsIcon, 
  Globe, 
  LogOut, 
  User,
  Bell,
  Volume2,
  VolumeX,
  Shield,
  Upload,
  X,
  Camera,
  MousePointer
} from 'lucide-react';

const Settings = () => {
  const { user, token, updateUser, logout } = useAuth();
  const { t, language, changeLanguage, showLanguageToggle } = useLanguage();
  const { 
    settings: audioSettings, 
    setSoundEnabled,
    setVolume,
    setHoverSoundsEnabled,
    playClick
  } = useSound();
  
  const [notifications, setNotifications] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleLogout = async () => {
    await logout();
    toast.success(language === 'de' ? 'Erfolgreich abgemeldet' : 'Successfully logged out');
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'de' ? 'Bitte nur Bilder hochladen' : 'Please upload images only');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'de' ? 'Bild darf max. 5MB sein' : 'Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result;
        setPreviewUrl(base64);
        const response = await fetch(`/api/user/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ avatar: base64 })
        });
        if (!response.ok) throw new Error('Upload failed');
        if (updateUser) updateUser({ ...user, avatar: base64 });
        toast.success(language === 'de' ? 'Profilbild aktualisiert!' : 'Profile picture updated!');
        setUploading(false);
      };
      reader.onerror = () => {
        toast.error(language === 'de' ? 'Fehler beim Lesen der Datei' : 'Error reading file');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error(error.message);
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      const response = await fetch(`/api/user/avatar`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Delete failed');
      setPreviewUrl(null);
      if (updateUser) updateUser({ ...user, avatar: null });
      toast.success(language === 'de' ? 'Profilbild entfernt' : 'Profile picture removed');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const currentAvatar = previewUrl || user?.avatar;

  const handleTestSound = () => {
    playClick();
    toast.success(language === 'de' ? 'Sound getestet!' : 'Sound tested!');
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-2xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary" />
            {t('settings')}
          </h1>
          <p className="text-white/50 mt-2">
            {language === 'de' ? 'Verwalte deine Kontoeinstellungen' : 'Manage your account settings'}
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Picture */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Profilbild' : 'Profile Picture'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-6">
                <div className="relative">
                  <Avatar className="w-24 h-24 border-2 border-primary/30">
                    <AvatarImage src={currentAvatar} />
                    <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                      {user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {currentAvatar && (
                    <button onClick={removeAvatar} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600" disabled={uploading}>
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
                      ${dragActive ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-primary/50'}
                      ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="file" accept="image/*" onChange={handleFileInput} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
                    <div className="flex flex-col items-center gap-2">
                      {uploading ? (
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className={`w-6 h-6 ${dragActive ? 'text-primary' : 'text-white/60'}`} />
                      )}
                      <p className="text-white/60 text-sm">{language === 'de' ? 'Bild hochladen (max 5MB)' : 'Upload image (max 5MB)'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Konto' : 'Account'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div>
                  <p className="text-white font-medium">{user?.username}</p>
                  <p className="text-white/50 text-sm">{user?.email}</p>
                </div>
                <p className="text-primary font-mono">{t('level')} {user?.level || 1}</p>
              </div>
            </CardContent>
          </Card>

          {/* Audio */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Sound' : 'Sound'}
              </CardTitle>
              <CardDescription className="text-white/50">
                {language === 'de' ? 'Soundeffekte anpassen' : 'Customize sound effects'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Sound Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {audioSettings.soundEnabled ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-white/40" />}
                  <div>
                    <Label className="text-white">{language === 'de' ? 'Sound aktiviert' : 'Sound Enabled'}</Label>
                    <p className="text-white/50 text-sm">{language === 'de' ? 'Alle Sounds ein/aus' : 'Toggle all sounds'}</p>
                  </div>
                </div>
                <Switch checked={audioSettings.soundEnabled} onCheckedChange={setSoundEnabled} />
              </div>

              {audioSettings.soundEnabled && (
                <>
                  <Separator className="bg-white/10" />
                  
                  {/* Volume */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-white">{language === 'de' ? 'Lautstärke' : 'Volume'}</Label>
                      <span className="text-white/60 text-sm font-mono">{audioSettings.volume}%</span>
                    </div>
                    <Slider value={[audioSettings.volume]} onValueChange={([v]) => setVolume(v)} max={100} step={1} className="w-full" />
                  </div>

                  <Separator className="bg-white/10" />

                  {/* Hover Sounds */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MousePointer className="w-5 h-5 text-white/60" />
                      <div>
                        <Label className="text-white">{language === 'de' ? 'Hover-Sounds' : 'Hover Sounds'}</Label>
                        <p className="text-white/50 text-sm">{language === 'de' ? 'Sound bei Button-Hover' : 'Sound on button hover'}</p>
                      </div>
                    </div>
                    <Switch checked={audioSettings.hoverSoundsEnabled} onCheckedChange={setHoverSoundsEnabled} />
                  </div>

                  {/* Test Button */}
                  <Button onClick={handleTestSound} variant="outline" className="w-full border-white/20 text-white hover:bg-white/10">
                    <Volume2 className="w-4 h-4 mr-2" />
                    {language === 'de' ? 'Sound testen' : 'Test Sound'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Language - only if enabled */}
          {showLanguageToggle && (
            <Card className="bg-[#0A0A0C] border-white/5">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  {language === 'de' ? 'Sprache' : 'Language'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button variant={language === 'en' ? 'default' : 'outline'} onClick={() => changeLanguage('en')}
                    className={language === 'en' ? 'bg-primary text-black' : 'border-white/20 text-white hover:bg-white/10'}>
                    English
                  </Button>
                  <Button variant={language === 'de' ? 'default' : 'outline'} onClick={() => changeLanguage('de')}
                    className={language === 'de' ? 'bg-primary text-black' : 'border-white/20 text-white hover:bg-white/10'}>
                    Deutsch
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notifications */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-white/60" />
                  <Label className="text-white">{language === 'de' ? 'Push-Benachrichtigungen' : 'Push Notifications'}</Label>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
            </CardContent>
          </Card>

          {/* Legal */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Rechtliches' : 'Legal'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 text-sm">{t('disclaimer')}</p>
              </div>
            </CardContent>
          </Card>

          {/* Logout */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="pt-6">
              <Button onClick={handleLogout} variant="destructive" className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30">
                <LogOut className="w-4 h-4 mr-2" />
                {t('logout')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Settings;
