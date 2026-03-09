import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Navbar from '../components/Navbar';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  Search,
  Users,
  Crown,
  Star,
  Package,
  Loader2,
  TrendingUp,
} from 'lucide-react';

const t = (key, lang) => {
  const translations = {
    playerDir: { de: 'Spielerverzeichnis', en: 'Player Directory' },
    search: { de: 'Spieler suchen...', en: 'Search players...' },
    level: { de: 'Level', en: 'Level' },
    name: { de: 'Name', en: 'Name' },
    balance: { de: 'Balance', en: 'Balance' },
    newest: { de: 'Neueste', en: 'Newest' },
    noPlayers: { de: 'Keine Spieler gefunden', en: 'No players found' },
    items: { de: 'Items', en: 'Items' },
    totalPlayers: { de: 'Spieler', en: 'Players' },
  };
  return translations[key]?.[lang] || translations[key]?.en || key;
};

const PlayerCard = ({ player, onClick, lang }) => (
  <Card
    data-testid={`player-${player.user_id}`}
    onClick={() => onClick(player.user_id)}
    className="bg-[#0A0A0C] border border-white/5 hover:border-white/20 cursor-pointer transition-all duration-200 hover:shadow-lg"
  >
    <CardContent className="p-4 flex items-center gap-4">
      <Avatar className="h-12 w-12 border-2 border-white/10">
        <AvatarImage src={player.avatar} />
        <AvatarFallback className="text-lg bg-primary/20 text-primary">
          {player.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="text-white font-semibold truncate"
            style={{ color: player.active_name_color || '#EDEDED' }}
          >
            {player.username}
          </p>
          {player.badge && (
            <Badge className="bg-[#FFD700]/20 text-[#FFD700] border-0 text-[10px]">
              <Crown className="w-3 h-3 mr-0.5" />
              {player.badge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40 font-mono mt-0.5">
          <span>Lv. {player.level}</span>
          <span>{player.item_count} {t('items', lang)}</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-white/30 text-xs font-mono">
          {new Date(player.created_at).toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' })}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function PlayerDirectory() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language;

  const [players, setPlayers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('level');

  const loadPlayers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort: sortBy, limit: '100' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/players?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players);
        setTotal(data.total);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, sortBy]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  return (
    <div className="min-h-screen bg-[#050505]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1
            data-testid="player-dir-title"
            className="text-3xl sm:text-4xl font-bold text-white tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            <Users className="w-8 h-8 inline-block mr-3 text-[#00F0FF]" />
            {t('playerDir', lang)}
          </h1>
          <p className="text-white/40 text-sm mt-1 font-mono">
            {total} {t('totalPlayers', lang)}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              data-testid="player-search"
              placeholder={t('search', lang)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-black/50 border-white/10 focus:border-[#00F0FF] text-white placeholder:text-white/30"
            />
          </div>
          <select
            data-testid="player-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-white text-sm outline-none"
          >
            <option value="level">{t('level', lang)}</option>
            <option value="name">{t('name', lang)}</option>
            <option value="newest">{t('newest', lang)}</option>
          </select>
        </div>

        {/* Player List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#00F0FF] animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 font-mono">{t('noPlayers', lang)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {players.map((player) => (
              <PlayerCard
                key={player.user_id}
                player={player}
                onClick={(uid) => navigate(`/player/${uid}`)}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
