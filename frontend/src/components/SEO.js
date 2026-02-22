import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

// =============================================================================
// SEO CONFIGURATION - Enterprise Level
// =============================================================================

const SITE_CONFIG = {
  siteName: 'Goladium',
  siteUrl: 'https://goladium.de',
  defaultImage: 'https://goladium.de/og-image.png',
  twitterHandle: '@goladium',
  locale: 'de_DE',
  localeAlternate: 'en_US',
};

// High-intent keywords for each page type
const KEYWORDS = {
  home: [
    'casino simulator', 'virtual casino', 'slot machine simulator no real money',
    'kostenlose slots', 'casino spiel kostenlos', 'goladium', 'case battle simulator',
    'free casino game', 'no deposit casino', 'play slots free'
  ],
  slots: [
    'slot machine simulator', 'free slots no money', 'virtual slot machine',
    'slot spiele kostenlos', 'spielautomaten simulation', 'classic slots free',
    'fruit machine simulator', 'online slots no gambling'
  ],
  wheel: [
    'lucky wheel game', 'spin wheel free', 'glücksrad online kostenlos',
    'wheel of fortune simulator', 'free spin wheel', 'daily spin game'
  ],
  trading: [
    'trading simulator game', 'item trading game', 'virtual trading platform',
    'trade items online', 'trading spiel', 'item exchange game'
  ],
  leaderboard: [
    'casino leaderboard', 'top players ranking', 'highscore casino',
    'bestenliste casino', 'player rankings'
  ],
  shop: [
    'virtual item shop', 'game shop', 'cosmetic items', 'virtual goods store'
  ],
  gamepass: [
    'battle pass', 'game pass rewards', 'season pass', 'premium rewards'
  ]
};

// =============================================================================
// PAGE-SPECIFIC SEO DATA
// =============================================================================

const PAGE_SEO = {
  '/': {
    title: 'Goladium - Kostenloser Casino Simulator | Slots & Glücksrad ohne Echtgeld',
    description: 'Erlebe Casino-Spiele ohne echtes Geld! Goladium ist der beste Slot Machine Simulator - 100% kostenlos. Drehe Slots, gewinne am Glücksrad und trade Items. Für Erwachsene ab 18.',
    keywords: KEYWORDS.home,
    type: 'website',
    schema: 'WebSite'
  },
  '/slots': {
    title: 'Kostenlose Slot Machines | Spielautomaten Simulator ohne Geld',
    description: 'Spiele die besten Slot Machine Simulatoren kostenlos! Keine Anmeldung, kein Echtgeld - nur Spielspaß. Classic Slots, Fruit Machines und mehr bei Goladium.',
    keywords: KEYWORDS.slots,
    type: 'game',
    schema: 'VideoGame'
  },
  '/wheel': {
    title: 'Gratis Glücksrad drehen | Lucky Wheel alle 5 Minuten',
    description: 'Drehe das Glücksrad kostenlos alle 5 Minuten! Gewinne bis zu 15 Goladium pro Spin. Der beste Free Spin Wheel Simulator - ohne Echtgeld, ohne Risiko.',
    keywords: KEYWORDS.wheel,
    type: 'game',
    schema: 'VideoGame'
  },
  '/trading': {
    title: 'Item Trading Simulator | Handel virtuelle Items',
    description: 'Trade Items mit anderen Spielern! Der beste Trading Simulator für virtuelle Gegenstände. Sichere Trades, fairer Marktplatz - komplett kostenlos bei Goladium.',
    keywords: KEYWORDS.trading,
    type: 'website',
    schema: 'WebPage'
  },
  '/leaderboard': {
    title: 'Bestenliste & Rankings | Top Casino Spieler',
    description: 'Sieh dir die Top-Spieler von Goladium an! Wöchentliche und All-Time Bestenlisten. Konkurriere um die Spitzenplätze im besten Casino Simulator.',
    keywords: KEYWORDS.leaderboard,
    type: 'website',
    schema: 'WebPage'
  },
  '/shop': {
    title: 'Item Shop | Virtuelle Items & Cosmetics kaufen',
    description: 'Entdecke exklusive virtuelle Items im Goladium Shop! Seltene Cosmetics, limitierte Items und mehr. Kaufe mit virtueller Währung - kein Echtgeld!',
    keywords: KEYWORDS.shop,
    type: 'website',
    schema: 'WebPage'
  },
  '/gamepass': {
    title: 'Game Pass | Battle Pass Belohnungen & Quests',
    description: 'Schalte exklusive Belohnungen frei mit dem Goladium Game Pass! Tägliche Quests, Truhen und seltene Items. Dein Weg zu den besten Rewards.',
    keywords: KEYWORDS.gamepass,
    type: 'website',
    schema: 'WebPage'
  },
  '/profile': {
    title: 'Spieler Profil',
    description: 'Dein Goladium Spielerprofil - Statistiken, Items und Achievements.',
    keywords: [],
    type: 'profile',
    noindex: true
  },
  '/settings': {
    title: 'Einstellungen',
    description: 'Verwalte deine Goladium Kontoeinstellungen.',
    keywords: [],
    type: 'website',
    noindex: true
  },
  '/inventory': {
    title: 'Dein Inventar | Items & Sammlungen',
    description: 'Verwalte deine gesammelten Items und Cosmetics.',
    keywords: [],
    type: 'website',
    noindex: true
  }
};

// =============================================================================
// MAIN SEO COMPONENT
// =============================================================================

const SEO = ({ 
  title,
  description,
  keywords = [],
  image,
  type = 'website',
  noindex = false,
  article = null,
  breadcrumbs = null,
  faq = null,
  children
}) => {
  const location = useLocation();
  const path = location.pathname;
  
  // Get page-specific SEO or use defaults
  const pageSeo = PAGE_SEO[path] || PAGE_SEO['/'];
  
  // Build final values
  const finalTitle = title || pageSeo.title;
  const finalDescription = description || pageSeo.description;
  const finalKeywords = [...(keywords.length ? keywords : pageSeo.keywords || [])];
  const finalImage = image || SITE_CONFIG.defaultImage;
  const finalType = type || pageSeo.type;
  const finalNoindex = noindex || pageSeo.noindex;
  const canonicalUrl = `${SITE_CONFIG.siteUrl}${path === '/' ? '' : path}`;

  // Build structured data
  const structuredData = [];
  
  // Always add WebSite schema on homepage
  if (path === '/') {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": SITE_CONFIG.siteName,
      "alternateName": ["Goladium Casino", "Goladium Simulator"],
      "url": SITE_CONFIG.siteUrl,
      "description": finalDescription,
      "inLanguage": ["de-DE", "en-US"],
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${SITE_CONFIG.siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    });
  }

  // Add WebPage schema for all pages
  structuredData.push({
    "@context": "https://schema.org",
    "@type": pageSeo.schema === 'VideoGame' ? 'VideoGame' : 'WebPage',
    "name": finalTitle,
    "description": finalDescription,
    "url": canonicalUrl,
    "inLanguage": "de-DE",
    "isPartOf": {
      "@type": "WebSite",
      "name": SITE_CONFIG.siteName,
      "url": SITE_CONFIG.siteUrl
    },
    ...(pageSeo.schema === 'VideoGame' && {
      "genre": ["Casino", "Simulation", "Casual"],
      "gamePlatform": ["Web Browser", "Mobile Web"],
      "applicationCategory": "Game",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "EUR"
      }
    })
  });

  // Add BreadcrumbList if provided
  if (breadcrumbs && breadcrumbs.length > 0) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": item.name,
        "item": `${SITE_CONFIG.siteUrl}${item.path}`
      }))
    });
  }

  // Add FAQ if provided
  if (faq && faq.length > 0) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faq.map(item => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      }))
    });
  }

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{finalTitle}</title>
      <meta name="title" content={finalTitle} />
      <meta name="description" content={finalDescription} />
      {finalKeywords.length > 0 && (
        <meta name="keywords" content={finalKeywords.join(', ')} />
      )}
      
      {/* Canonical & Language */}
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hreflang="de" href={canonicalUrl} />
      <link rel="alternate" hreflang="en" href={`${canonicalUrl}${path === '/' ? '' : '/'}?lang=en`} />
      <link rel="alternate" hreflang="x-default" href={canonicalUrl} />
      
      {/* Robots */}
      <meta 
        name="robots" 
        content={finalNoindex 
          ? "noindex, nofollow" 
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        } 
      />
      <meta 
        name="googlebot" 
        content={finalNoindex 
          ? "noindex, nofollow" 
          : "index, follow, max-image-preview:large"
        } 
      />

      {/* Open Graph */}
      <meta property="og:type" content={finalType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:image" content={finalImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={finalTitle} />
      <meta property="og:site_name" content={SITE_CONFIG.siteName} />
      <meta property="og:locale" content={SITE_CONFIG.locale} />
      <meta property="og:locale:alternate" content={SITE_CONFIG.localeAlternate} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE_CONFIG.twitterHandle} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={finalDescription} />
      <meta name="twitter:image" content={finalImage} />
      <meta name="twitter:image:alt" content={finalTitle} />

      {/* Structured Data */}
      {structuredData.map((schema, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}

      {children}
    </Helmet>
  );
};

// =============================================================================
// SPECIALIZED SEO COMPONENTS FOR EACH PAGE
// =============================================================================

export const HomeSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' }
    ]}
    faq={[
      {
        question: 'Ist Goladium kostenlos?',
        answer: 'Ja, Goladium ist 100% kostenlos. Es wird kein echtes Geld verwendet - nur virtuelle Spielwährung.'
      },
      {
        question: 'Ist das echtes Glücksspiel?',
        answer: 'Nein, Goladium ist ein Casino Simulator ohne echtes Geld. Es dient nur der Unterhaltung und ist kein Glücksspiel.'
      },
      {
        question: 'Wie funktioniert der Slot Machine Simulator?',
        answer: 'Du spielst mit virtueller Währung (Goladium), die du kostenlos erhältst. Gewinne und Verluste sind nur simuliert.'
      },
      {
        question: 'Ab welchem Alter darf man spielen?',
        answer: 'Goladium ist für Erwachsene ab 18 Jahren bestimmt, da es Casino-Elemente simuliert.'
      }
    ]}
  />
);

export const SlotsSEO = ({ slotName = 'Classic' }) => (
  <SEO 
    title={`${slotName} Slot Machine Simulator | Kostenlos spielen ohne Geld`}
    description={`Spiele den ${slotName} Slot Machine Simulator kostenlos! Keine Einzahlung, kein echtes Geld - nur purer Spielspaß. Der beste Free Slots Simulator.`}
    keywords={[
      ...KEYWORDS.slots,
      `${slotName.toLowerCase()} slot`, 
      `${slotName.toLowerCase()} slot machine`,
      `play ${slotName.toLowerCase()} slots free`
    ]}
    type="game"
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Slots', path: '/slots' },
      { name: slotName, path: `/slots/${slotName.toLowerCase()}` }
    ]}
  />
);

export const WheelSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Glücksrad', path: '/wheel' }
    ]}
    faq={[
      {
        question: 'Wie oft kann ich das Glücksrad drehen?',
        answer: 'Du kannst das Glücksrad alle 5 Minuten kostenlos drehen und bis zu 15 Goladium gewinnen.'
      },
      {
        question: 'Was kann ich gewinnen?',
        answer: 'Du kannst 1, 5 oder 15 Goladium (virtuelle Währung) gewinnen - komplett kostenlos!'
      }
    ]}
  />
);

export const TradingSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Trading', path: '/trading' }
    ]}
    faq={[
      {
        question: 'Wie funktioniert das Trading?',
        answer: 'Du kannst deine virtuellen Items mit anderen Spielern tauschen. Erstelle Trade-Angebote oder akzeptiere bestehende.'
      },
      {
        question: 'Ist Trading sicher?',
        answer: 'Ja, alle Trades werden vom System überwacht. Items werden erst übertragen wenn beide Parteien zustimmen.'
      }
    ]}
  />
);

export const LeaderboardSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Leaderboard', path: '/leaderboard' }
    ]}
  />
);

export const ShopSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Shop', path: '/shop' }
    ]}
  />
);

export const GamePassSEO = () => (
  <SEO 
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Game Pass', path: '/gamepass' }
    ]}
  />
);

export const ProfileSEO = ({ username }) => (
  <SEO 
    title={`${username}'s Profil | Goladium Spieler`}
    description={`Sieh dir das Profil von ${username} auf Goladium an - Statistiken, Level und Erfolge.`}
    noindex={true}
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Profil', path: `/profile/${username}` }
    ]}
  />
);

export const SettingsSEO = () => (
  <SEO noindex={true} />
);

export const InventorySEO = () => (
  <SEO 
    title="Dein Inventar | Goladium Items"
    noindex={true}
    breadcrumbs={[
      { name: 'Home', path: '/' },
      { name: 'Inventar', path: '/inventory' }
    ]}
  />
);

export default SEO;
