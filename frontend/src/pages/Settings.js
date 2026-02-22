import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { toast } from 'sonner';
import { 
  Settings as SettingsIcon, 
  Globe, 
  LogOut, 
  User,
  Bell,
  Volume2,
  Shield,
  Upload,
  ImageIcon,
  X,
  Camera
} from 'lucide-react';



const Settings = () => {
  const { user, token, updateUser, logout } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'de' ? 'Bitte nur Bilder hochladen' : 'Please upload images only');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'de' ? 'Bild darf max. 5MB sein' : 'Image must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result;
        setPreviewUrl(base64);

        // Upload to server
        const response = await fetch(`/api/user/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ avatar: base64 })
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        
        // Update user context
        if (updateUser) {
          updateUser({ ...user, avatar: base64 });
        }

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
  }, [language, token, user, updateUser]);

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
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      setPreviewUrl(null);
      if (updateUser) {
        updateUser({ ...user, avatar: null });
      }
      toast.success(language === 'de' ? 'Profilbild entfernt' : 'Profile picture removed');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const currentAvatar = previewUrl || user?.avatar;

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
            {language === 'de' 
              ? 'Verwalte deine Kontoeinstellungen und Präferenzen'
              : 'Manage your account settings and preferences'}
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Picture Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Profilbild' : 'Profile Picture'}
              </CardTitle>
              <CardDescription className="text-white/50">
                {language === 'de' 
                  ? 'Lade ein Bild hoch oder ziehe es hierher'
                  : 'Upload an image or drag and drop it here'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-6">
                {/* Current Avatar */}
                <div className="relative">
                  <Avatar className="w-24 h-24 border-2 border-primary/30">
                    <AvatarImage src={currentAvatar} />
                    <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                      {user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {currentAvatar && (
                    <button
                      onClick={removeAvatar}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      disabled={uploading}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>

                {/* Upload Area */}
                <div className="flex-1">
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`
                      relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
                      ${dragActive 
                        ? 'border-primary bg-primary/10' 
                        : 'border-white/20 hover:border-primary/50 hover:bg-white/5'
                      }
                      ${uploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    
                    <div className="flex flex-col items-center gap-2">
                      {uploading ? (
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          dragActive ? 'bg-primary/20' : 'bg-white/10'
                        }`}>
                          <Upload className={`w-6 h-6 ${dragActive ? 'text-primary' : 'text-white/60'}`} />
                        </div>
                      )}
                      
                      <div>
                        <p className={`font-medium ${dragActive ? 'text-primary' : 'text-white'}`}>
                          {uploading 
                            ? (language === 'de' ? 'Wird hochgeladen...' : 'Uploading...')
                            : dragActive
                              ? (language === 'de' ? 'Bild hier ablegen' : 'Drop image here')
                              : (language === 'de' ? 'Bild hierher ziehen' : 'Drag image here')
                          }
                        </p>
                        <p className="text-white/40 text-sm mt-1">
                          {language === 'de' 
                            ? 'oder klicken zum Auswählen (max. 5MB)'
                            : 'or click to select (max 5MB)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Konto' : 'Account'}
              </CardTitle>
              <CardDescription className="text-white/50">
                {language === 'de' 
                  ? 'Deine Kontoinformationen'
                  : 'Your account information'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div>
                  <p className="text-white font-medium">{user?.username}</p>
                  <p className="text-white/50 text-sm">{user?.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-primary font-mono">{t('level')} {user?.level || 1}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Language Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Sprache' : 'Language'}
              </CardTitle>
              <CardDescription className="text-white/50">
                {language === 'de' 
                  ? 'Wähle deine bevorzugte Sprache'
                  : 'Choose your preferred language'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button
                  variant={language === 'en' ? 'default' : 'outline'}
                  onClick={() => changeLanguage('en')}
                  className={language === 'en' 
                    ? 'bg-primary text-black' 
                    : 'border-white/20 text-white hover:bg-white/10'
                  }
                  data-testid="lang-en-btn"
                >
                  🇬🇧 English
                </Button>
                <Button
                  variant={language === 'de' ? 'default' : 'outline'}
                  onClick={() => changeLanguage('de')}
                  className={language === 'de' 
                    ? 'bg-primary text-black' 
                    : 'border-white/20 text-white hover:bg-white/10'
                  }
                  data-testid="lang-de-btn"
                >
                  🇩🇪 Deutsch
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preferences Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Einstellungen' : 'Preferences'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-white/60" />
                  <div>
                    <Label className="text-white">
                      {language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
                    </Label>
                    <p className="text-white/50 text-sm">
                      {language === 'de' 
                        ? 'Erhalte Benachrichtigungen über große Gewinne'
                        : 'Get notified about big wins'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>

              <Separator className="bg-white/10" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-white/60" />
                  <div>
                    <Label className="text-white">
                      {language === 'de' ? 'Soundeffekte' : 'Sound Effects'}
                    </Label>
                    <p className="text-white/50 text-sm">
                      {language === 'de' 
                        ? 'Aktiviere Spielsounds'
                        : 'Enable game sounds'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={sounds}
                  onCheckedChange={setSounds}
                />
              </div>
            </CardContent>
          </Card>

          {/* Disclaimer Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                {language === 'de' ? 'Rechtliches' : 'Legal'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 text-sm">
                  {t('disclaimer')}
                </p>
                <p className="text-white/40 text-xs mt-2">
                  Not affiliated with Roblox or any other platform.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Logout Section */}
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="pt-6">
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                data-testid="settings-logout-btn"
              >
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
