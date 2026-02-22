import React, { createContext, useContext, useState, useEffect } from 'react';

// Feature flag to hide/show language toggle - set to false for English-only alpha
const SHOW_LANGUAGE_TOGGLE = process.env.REACT_APP_SHOW_LANGUAGE_TOGGLE !== 'false';

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // If toggle is hidden, force English
    if (!SHOW_LANGUAGE_TOGGLE) return 'en';
    return localStorage.getItem('goladium_lang') || 'en';
  });
  const [translations, setTranslations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTranslations(language);
  }, [language]);

  const loadTranslations = async (lang) => {
    try {
      const response = await fetch(`/api/translations?lang=${lang}`);
      if (response.ok) {
        const data = await response.json();
        setTranslations(data);
        return;
      }
    } catch (error) {
      // API not available, use fallback
    }
    
    // Fallback translations (used when API is not available or returns error)
    setTranslations({
      app_name: 'Goladium',
      disclaimer: lang === 'de' ? 'Simulation ohne echten Geldwert.' : 'Simulation with no real monetary value.',
      currency_name: 'Goladium',
      login: lang === 'de' ? 'Anmelden' : 'Login',
      register: lang === 'de' ? 'Registrieren' : 'Register',
      logout: lang === 'de' ? 'Abmelden' : 'Logout',
      spin: lang === 'de' ? 'Drehen' : 'Spin',
      bet: lang === 'de' ? 'Einsatz' : 'Bet',
      balance: lang === 'de' ? 'Guthaben' : 'Balance',
      history: lang === 'de' ? 'Verlauf' : 'History',
      profile: lang === 'de' ? 'Profil' : 'Profile',
      settings: lang === 'de' ? 'Einstellungen' : 'Settings',
      leaderboard: lang === 'de' ? 'Bestenliste' : 'Leaderboard',
      chat: 'Chat',
      lucky_wheel: lang === 'de' ? 'Glücksrad' : 'Lucky Wheel',
      slot_machine: lang === 'de' ? 'Spielautomat' : 'Slot Machine',
      jackpot: 'Jackpot',
      win: lang === 'de' ? 'Gewinn' : 'Win',
      loss: lang === 'de' ? 'Verlust' : 'Loss',
      level: 'Level',
      xp: 'XP',
      total_spins: lang === 'de' ? 'Gesamtdrehungen' : 'Total Spins',
      total_wins: lang === 'de' ? 'Gesamtgewinne' : 'Total Wins',
      total_losses: lang === 'de' ? 'Gesamtverluste' : 'Total Losses',
      net_profit: lang === 'de' ? 'Nettogewinn' : 'Net Profit',
      insufficient_balance: lang === 'de' ? 'Nicht genügend Guthaben' : 'Insufficient balance',
      cooldown_active: lang === 'de' ? 'Abklingzeit aktiv' : 'Cooldown active',
      next_spin_in: lang === 'de' ? 'Nächster Spin in' : 'Next spin in',
      payout_table: lang === 'de' ? 'Auszahlungstabelle' : 'Payout Table',
      rtp: lang === 'de' ? 'Auszahlungsquote' : 'Return to Player',
      symbol: 'Symbol',
      multiplier: lang === 'de' ? 'Multiplikator' : 'Multiplier',
      probability: lang === 'de' ? 'Wahrscheinlichkeit' : 'Probability',
      // Trading translations
      trading: 'Trading',
      new_trade: lang === 'de' ? 'Neuer Trade' : 'New Trade',
      inbound: lang === 'de' ? 'Eingehend' : 'Inbound',
      outbound: lang === 'de' ? 'Ausgehend' : 'Outbound',
      completed: lang === 'de' ? 'Abgeschlossen' : 'Completed',
      // Shop translations
      shop: 'Shop',
      prestige: 'Prestige',
      inventory: lang === 'de' ? 'Inventar' : 'Inventory',
      customization: lang === 'de' ? 'Anpassung' : 'Customization',
      // Live wins
      live_wins: lang === 'de' ? 'Live Gewinne' : 'Live Wins'
    });
    setLoading(false);
  };

  const changeLanguage = (lang) => {
    localStorage.setItem('goladium_lang', lang);
    setLanguage(lang);
    // useEffect will automatically reload translations when language changes
  };

  const t = (key) => {
    return translations[key] || key;
  };

  const value = {
    language,
    translations,
    loading,
    changeLanguage,
    t,
    showLanguageToggle: SHOW_LANGUAGE_TOGGLE
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
