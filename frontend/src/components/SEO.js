import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO_CONFIG = {
  siteName: 'Goladium',
  siteUrl: 'https://goladium.de',
  defaultTitle: 'Goladium - Kostenloses Casino Simulationsspiel | Slots & Glücksrad',
  defaultDescription: 'Erlebe den Nervenkitzel von Casino-Spielen ohne echtes Geld! Spiele Slots, drehe das Glücksrad und sammle virtuelle Belohnungen. 100% kostenlos, 100% Spaß.',
  defaultImage: 'https://goladium.de/og-image.png',
  twitterHandle: '@goladium',
  locale: 'de_DE',
};

const SEO = ({ 
  title, 
  description, 
  image,
  path = '',
  type = 'website',
  noindex = false,
  structuredData = null,
  children
}) => {
  const pageTitle = title 
    ? `${title} | ${SEO_CONFIG.siteName}`
    : SEO_CONFIG.defaultTitle;
  
  const pageDescription = description || SEO_CONFIG.defaultDescription;
  const pageImage = image || SEO_CONFIG.defaultImage;
  const pageUrl = `${SEO_CONFIG.siteUrl}${path}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="title" content={pageTitle} />
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={pageUrl} />
      
      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:image" content={pageImage} />
      <meta property="og:site_name" content={SEO_CONFIG.siteName} />
      <meta property="og:locale" content={SEO_CONFIG.locale} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={pageUrl} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={pageImage} />

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}

      {children}
    </Helmet>
  );
};

// Pre-configured SEO for specific pages
export const HomeSEO = () => (
  <SEO 
    path="/"
    structuredData={{
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Goladium - Casino Simulation",
      "description": SEO_CONFIG.defaultDescription,
      "url": SEO_CONFIG.siteUrl,
      "isPartOf": {
        "@type": "WebSite",
        "name": "Goladium",
        "url": SEO_CONFIG.siteUrl
      }
    }}
  />
);

export const SlotsSEO = ({ slotName = 'Classic' }) => (
  <SEO 
    title={`${slotName} Slot Machine - Kostenlos spielen`}
    description={`Spiele den ${slotName} Slot kostenlos! Drehe die Walzen und gewinne virtuelle Münzen. Kein echtes Geld, nur purer Spielspaß.`}
    path="/slots"
    structuredData={{
      "@context": "https://schema.org",
      "@type": "Game",
      "name": `${slotName} Slot - Goladium`,
      "description": `Kostenloser ${slotName} Slot Machine Simulator`,
      "genre": "Casino Simulation",
      "gamePlatform": "Web Browser"
    }}
  />
);

export const WheelSEO = () => (
  <SEO 
    title="Glücksrad - Alle 5 Minuten kostenlos drehen"
    description="Drehe das Glücksrad alle 5 Minuten kostenlos und gewinne bis zu 15 Goladium! Tägliche Chancen auf große Gewinne."
    path="/wheel"
    structuredData={{
      "@context": "https://schema.org",
      "@type": "Game",
      "name": "Goladium Glücksrad",
      "description": "Kostenloses Glücksrad - alle 5 Minuten drehen",
      "genre": "Casual Game"
    }}
  />
);

export const LeaderboardSEO = () => (
  <SEO 
    title="Leaderboard - Top Spieler Rangliste"
    description="Sieh dir die Top-Spieler von Goladium an! Wer hat die meisten Gewinne? Konkurriere um die Spitzenplätze."
    path="/leaderboard"
  />
);

export const ShopSEO = () => (
  <SEO 
    title="Shop - Virtuelle Items kaufen"
    description="Entdecke exklusive virtuelle Items im Goladium Shop. Kosmetische Gegenstände und mehr für dein Spielerlebnis."
    path="/shop"
  />
);

export const TradingSEO = () => (
  <SEO 
    title="Trading - Items handeln"
    description="Handle deine virtuellen Items mit anderen Spielern. Finde seltene Gegenstände und baue deine Sammlung aus."
    path="/trading"
  />
);

export const ProfileSEO = ({ username }) => (
  <SEO 
    title={`${username}'s Profil`}
    description={`Sieh dir das Profil von ${username} auf Goladium an.`}
    path={`/profile/${username}`}
    noindex={true}
  />
);

export const SettingsSEO = () => (
  <SEO 
    title="Einstellungen"
    description="Verwalte deine Goladium Kontoeinstellungen."
    path="/settings"
    noindex={true}
  />
);

export default SEO;
