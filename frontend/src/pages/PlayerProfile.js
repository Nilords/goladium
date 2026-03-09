import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import Navbar from '../components/Navbar';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  ArrowLeft,
  Package,
  Store,
  Megaphone,
  Users,
  Crown,
  Loader2,
  ShoppingCart,
  Tag,
  ArrowRight,
} from 'lucide-react';

const RARITY_COLORS = {
  common: { bg: 'rgba(156,163,175,0.15)', text: '#9CA3AF' },
  uncommon: { bg: 'rgba(34,197,94,0.15)', text: '#22C55E' },
  rare: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  epic: { bg: 'rgba(168,85,247,0.15)', text: '#A855F7' },
  legendary: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
};

const t = (key, lang) => {
  const translations = {
    inventory: { de: 'Inventar', en: 'Inventory' },
    listings: { de: 'Angebote', en: 'Listings' },
    tradeAds: { de: 'Anzeigen', en: 'Ads' },
    back: { de: 'Zurück', en: 'Back' },
    notFound: { de: 'Spieler nicht gefunden', en: 'Player not found' },
    noItems: { de: 'Keine Items', en: 'No items' },
    noListings: { de: 'Keine Angebote', en: 'No listings' },
    noAds: { de: 'Keine Anzeigen', en: 'No ads' },
    level: { de: 'Level', en: 'Level' },
    offering: { de: 'Bietet', en: 'Offering' },
    seeking: { de: 'Sucht', en: 'Seeking' },
    memberSince: { de: 'Mitglied seit', en: 'Member since' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

export default function PlayerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/players/${userId}/profile`);
        if (res.ok) setProfile(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [userId]);

  if (loading) return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      <div className="flex items-center justify-center py-40">
        <Loader2 className="w-8 h-8 text-[#00F0FF] animate-spin" />
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Users className="w-16 h-16 text-white/10 mx-auto mb-4" />
        <p className="text-white/30 font-mono text-lg">{t('notFound', lang)}</p>
        <Button variant="ghost" onClick={() => navigate('/players')} className="mt-4 text-white/50">
          <ArrowLeft className="w-4 h-4 mr-2" /> {t('back', lang)}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          data-testid="back-btn"
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-white/40 hover:text-white mb-6 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> {t('back', lang)}
        </Button>

        {/* Profile Header */}
        <div className="flex items-center gap-5 mb-8">
          <Avatar className="h-20 w-20 border-2 border-white/10">
            <AvatarImage src={profile.avatar} />
            <AvatarFallback className="text-2xl bg-primary/20 text-primary">
              {profile.username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1
                data-testid="player-username"
                className="text-3xl font-bold tracking-tight"
                style={{ color: profile.active_name_color || '#EDEDED', fontFamily: "'Syne', sans-serif" }}
              >
                {profile.username}
              </h1>
              {profile.badge && (
                <Badge className="bg-[#FFD700]/20 text-[#FFD700] border-0">
                  <Crown className="w-3 h-3 mr-0.5" />
                  {profile.badge}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-white/40 font-mono">
              <span>Lv. {profile.level}</span>
              <span>{profile.inventory_count} Items</span>
              <span>
                {t('memberSince', lang)}: {new Date(profile.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="inventory">
          <TabsList className="bg-[#0A0A0C] border border-white/5 mb-6">
            <TabsTrigger data-testid="tab-inv" value="inventory" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Package className="w-4 h-4 mr-2" />
              {t('inventory', lang)} ({profile.inventory_count})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-listings" value="listings" className="data-[state=active]:bg-[#FFD700]/10 data-[state=active]:text-[#FFD700]">
              <Store className="w-4 h-4 mr-2" />
              {t('listings', lang)} ({profile.marketplace_listings?.length || 0})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-ads" value="ads" className="data-[state=active]:bg-[#FF6B6B]/10 data-[state=active]:text-[#FF6B6B]">
              <Megaphone className="w-4 h-4 mr-2" />
              {t('tradeAds', lang)} ({profile.trade_ads?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Inventory */}
          <TabsContent value="inventory">
            {profile.inventory.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm font-mono">{t('noItems', lang)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {profile.inventory.map((item) => {
                  const colors = RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common;
                  return (
                    <div
                      key={item.inventory_id}
                      data-testid={`pub-inv-${item.inventory_id}`}
                      className="bg-[#0A0A0C] border border-white/5 rounded-lg overflow-hidden"
                    >
                      <div className="h-20 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.bg}, transparent)` }}>
                        {item.item_image ? (
                          <img src={item.item_image} alt="" className="h-14 w-14 object-contain" />
                        ) : (
                          <Package className="w-8 h-8" style={{ color: colors.text, opacity: 0.5 }} />
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-white text-xs font-medium truncate">{item.item_name}</p>
                        <span className="text-[10px] font-mono uppercase" style={{ color: colors.text }}>{item.item_rarity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Marketplace Listings */}
          <TabsContent value="listings">
            {(!profile.marketplace_listings || profile.marketplace_listings.length === 0) ? (
              <div className="text-center py-16">
                <Store className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm font-mono">{t('noListings', lang)}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {profile.marketplace_listings.map((listing) => {
                  const colors = RARITY_COLORS[listing.item_rarity] || RARITY_COLORS.common;
                  return (
                    <div key={listing.listing_id} className="flex items-center gap-3 bg-[#0A0A0C] border border-white/5 rounded-lg p-3">
                      <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ background: colors.bg }}>
                        <Package className="w-5 h-5" style={{ color: colors.text }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{listing.item_name}</p>
                        <span className="text-[10px] font-mono uppercase" style={{ color: colors.text }}>{listing.item_rarity}</span>
                      </div>
                      <span className="text-[#FFD700] font-mono font-bold">{formatCurrency(listing.price)} G</span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Trade Ads */}
          <TabsContent value="ads">
            {(!profile.trade_ads || profile.trade_ads.length === 0) ? (
              <div className="text-center py-16">
                <Megaphone className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm font-mono">{t('noAds', lang)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {profile.trade_ads.map((ad) => (
                  <Card key={ad.ad_id} className="bg-[#0A0A0C] border border-white/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-[#00FF94] text-[10px] font-mono uppercase mb-1">{t('offering', lang)}</p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {ad.offering_items.map((item, i) => {
                              const c = RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common;
                              return (
                                <span key={i} className="px-2 py-0.5 rounded text-xs border" style={{ background: c.bg, borderColor: c.text + '40', color: '#fff' }}>
                                  {item.item_name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-white/20 mt-3 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-[#FF6B6B] text-[10px] font-mono uppercase mb-1">{t('seeking', lang)}</p>
                          <div className="flex flex-wrap gap-1">
                            {ad.seeking_items.map((item, i) => {
                              const c = RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common;
                              return (
                                <span key={i} className="px-2 py-0.5 rounded text-xs border" style={{ background: c.bg, borderColor: c.text + '40', color: '#fff' }}>
                                  {item.item_name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {ad.note && <p className="text-white/30 text-xs italic mt-2">"{ad.note}"</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
