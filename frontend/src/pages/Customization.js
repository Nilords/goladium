import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Chat from '../components/Chat';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Settings, 
  Palette, 
  Tag, 
  Flame, 
  Check,
  X,
  Crown,
  ShoppingBag
} from 'lucide-react';
import { Link } from 'react-router-dom';



const Customization = () => {
  const { user, token, refreshUser } = useAuth();
  const { language } = useLanguage();
  
  const [ownedCosmetics, setOwnedCosmetics] = useState([]);
  const [activeCosmetics, setActiveCosmetics] = useState({});
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    if (token) loadOwnedCosmetics();
  }, [token]);

  const loadOwnedCosmetics = async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/prestige/owned`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOwnedCosmetics(data.owned || []);
        setActiveCosmetics(data.active || {});
      }
    } catch (error) {
      console.error('Failed to load owned cosmetics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (cosmeticId, cosmeticType) => {
    setActivating(cosmeticId);
    
    try {
      const response = await fetch(`/api/prestige/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ 
          cosmetic_id: cosmeticId || 'none', 
          cosmetic_type: cosmeticType 
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success(data.message);
        if (refreshUser) refreshUser();
        loadOwnedCosmetics();
      } else {
        toast.error(data.detail || 'Failed to activate');
      }
    } catch (error) {
      console.error('Activate error:', error);
      toast.error('Failed to activate');
    } finally {
      setActivating(null);
    }
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'tag': return <Tag className="w-5 h-5" />;
      case 'name_color': return <Palette className="w-5 h-5" />;
      case 'jackpot_pattern': return <Flame className="w-5 h-5" />;
      default: return <Crown className="w-5 h-5" />;
    }
  };

  const getCategoryName = (type) => {
    const names = {
      tag: language === 'de' ? 'Player Tag' : 'Player Tag',
      name_color: language === 'de' ? 'Name Farbe' : 'Name Color',
      jackpot_pattern: language === 'de' ? 'Jackpot Muster' : 'Jackpot Pattern'
    };
    return names[type] || type;
  };

  const groupedCosmetics = {
    name_color: ownedCosmetics.filter(c => c.cosmetic_type === 'name_color'),
    tag: ownedCosmetics.filter(c => c.cosmetic_type === 'tag'),
    jackpot_pattern: ownedCosmetics.filter(c => c.cosmetic_type === 'jackpot_pattern')
  };

  const renderCosmeticItem = (cosmetic, type) => {
    const isActive = activeCosmetics[type] === cosmetic.cosmetic_id;
    
    return (
      <div
        key={cosmetic.cosmetic_id}
        data-testid={`cosmetic-${cosmetic.cosmetic_id}`}
        className={`flex items-center justify-between p-3 rounded-lg transition-all ${
          isActive 
            ? 'bg-primary/20 border border-primary/30' 
            : 'bg-white/5 border border-white/10 hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Preview */}
          <div className="w-10 h-10 rounded-lg bg-black/50 flex items-center justify-center">
            {type === 'name_color' ? (
              <div 
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: cosmetic.asset_value }}
              />
            ) : type === 'tag' ? (
              <span className="text-xl">{cosmetic.asset_value}</span>
            ) : (
              <div 
                className="w-8 h-8 rounded"
                style={{ background: cosmetic.asset_value }}
              />
            )}
          </div>
          
          <div>
            <p className="text-white font-medium">{cosmetic.display_name}</p>
            <p className="text-white/40 text-xs">{cosmetic.description}</p>
          </div>
        </div>
        
        <Button
          size="sm"
          onClick={() => handleActivate(isActive ? null : cosmetic.cosmetic_id, type)}
          disabled={activating === cosmetic.cosmetic_id}
          className={isActive 
            ? 'bg-primary hover:bg-primary/80' 
            : 'bg-white/10 hover:bg-white/20'
          }
        >
          {activating === cosmetic.cosmetic_id ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isActive ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              {language === 'de' ? 'Aktiv' : 'Active'}
            </>
          ) : (
            language === 'de' ? 'Aktivieren' : 'Activate'
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-4xl mx-auto px-4 w-full sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Settings className="w-8 h-8 text-primary" />
            {language === 'de' ? 'Anpassung' : 'Customization'}
          </h1>
          <p className="text-white/50">
            {language === 'de' 
              ? 'Wähle deine aktiven kosmetischen Items' 
              : 'Choose your active cosmetic items'}
          </p>
        </div>

        {/* Preview Card */}
        <Card className="bg-[#0A0A0C] border-white/10 mb-8">
          <CardHeader>
            <CardTitle className="text-white text-lg">
              {language === 'de' ? 'Vorschau' : 'Preview'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-black/50">
              {/* Tag */}
              {activeCosmetics.tag && (
                <span className="text-xl">
                  {ownedCosmetics.find(c => c.cosmetic_id === activeCosmetics.tag)?.asset_value}
                </span>
              )}
              
              {/* Username with color */}
              <span 
                className="text-xl font-bold"
                style={{ 
                  color: activeCosmetics.name_color 
                    ? ownedCosmetics.find(c => c.cosmetic_id === activeCosmetics.name_color)?.asset_value 
                    : '#FFFFFF'
                }}
              >
                {user?.username || 'Player'}
              </span>
            </div>
            
            {activeCosmetics.jackpot_pattern && (
              <div className="mt-4">
                <p className="text-white/40 text-sm mb-2">
                  {language === 'de' ? 'Jackpot Muster:' : 'Jackpot Pattern:'}
                </p>
                <div 
                  className="h-16 rounded-lg"
                  style={{ 
                    background: ownedCosmetics.find(c => c.cosmetic_id === activeCosmetics.jackpot_pattern)?.asset_value 
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ownedCosmetics.length === 0 ? (
          <Card className="bg-[#0A0A0C] border-white/5">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Crown className="w-16 h-16 text-white/20 mb-4" />
              <p className="text-white/50 text-lg mb-2">
                {language === 'de' ? 'Keine Kosmetik' : 'No Cosmetics'}
              </p>
              <p className="text-white/30 text-sm mb-6">
                {language === 'de' 
                  ? 'Besuche den Prestige Shop, um Kosmetik zu kaufen!' 
                  : 'Visit the Prestige Shop to buy cosmetics!'}
              </p>
              <Link to="/prestige-shop">
                <Button className="bg-primary hover:bg-primary/80">
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  {language === 'de' ? 'Zum Prestige Shop' : 'Go to Prestige Shop'}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {['name_color', 'tag', 'jackpot_pattern'].map(type => (
              <Card key={type} className="bg-[#0A0A0C] border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    {getCategoryIcon(type)}
                    {getCategoryName(type)}
                    {activeCosmetics[type] && (
                      <Badge className="bg-primary/20 text-primary border-0 ml-2">
                        {language === 'de' ? '1 aktiv' : '1 active'}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groupedCosmetics[type].length === 0 ? (
                    <p className="text-white/40 text-sm py-4 text-center">
                      {language === 'de' 
                        ? 'Keine Items in dieser Kategorie' 
                        : 'No items in this category'}
                    </p>
                  ) : (
                    <>
                      {/* Option to deactivate */}
                      {activeCosmetics[type] && (
                        <div
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-black/50 flex items-center justify-center">
                              <X className="w-5 h-5 text-white/40" />
                            </div>
                            <div>
                              <p className="text-white font-medium">
                                {language === 'de' ? 'Keine' : 'None'}
                              </p>
                              <p className="text-white/40 text-xs">
                                {language === 'de' ? 'Deaktivieren' : 'Deactivate'}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleActivate(null, type)}
                            disabled={activating === `none_${type}`}
                            className="bg-white/10 hover:bg-white/20"
                          >
                            {language === 'de' ? 'Auswählen' : 'Select'}
                          </Button>
                        </div>
                      )}
                      
                      {groupedCosmetics[type].map(c => renderCosmeticItem(c, type))}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
      <Chat />
    </div>
  );
};

export default Customization;
