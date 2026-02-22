import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  Gamepad2, 
  CircleDot, 
  Trophy, 
  ShoppingBag, 
  ArrowLeftRight,
  Star,
  Gift
} from 'lucide-react';

// =============================================================================
// INTERNAL LINKING COMPONENT - Improves SEO through better site structure
// =============================================================================

const RELATED_PAGES = {
  '/': ['slots', 'wheel', 'leaderboard', 'shop'],
  '/slots': ['wheel', 'leaderboard', 'gamepass'],
  '/wheel': ['slots', 'shop', 'leaderboard'],
  '/leaderboard': ['slots', 'wheel', 'trading'],
  '/shop': ['trading', 'gamepass', 'customization'],
  '/trading': ['shop', 'inventory', 'leaderboard'],
  '/gamepass': ['shop', 'slots', 'wheel'],
  '/inventory': ['trading', 'shop', 'customization'],
  '/customization': ['shop', 'inventory', 'gamepass']
};

const PAGE_INFO = {
  slots: {
    path: '/slots',
    icon: Gamepad2,
    title: { de: 'Slot Machines', en: 'Slot Machines' },
    description: { de: 'Spiele kostenlose Slots', en: 'Play free slots' },
    color: 'text-purple-400',
    keywords: 'slot machine simulator, free slots'
  },
  wheel: {
    path: '/wheel',
    icon: CircleDot,
    title: { de: 'Glücksrad', en: 'Lucky Wheel' },
    description: { de: 'Drehe alle 5 Min', en: 'Spin every 5 min' },
    color: 'text-yellow-400',
    keywords: 'lucky wheel, free spin'
  },
  leaderboard: {
    path: '/leaderboard',
    icon: Trophy,
    title: { de: 'Bestenliste', en: 'Leaderboard' },
    description: { de: 'Top Spieler Rankings', en: 'Top player rankings' },
    color: 'text-amber-400',
    keywords: 'leaderboard, rankings'
  },
  shop: {
    path: '/shop',
    icon: ShoppingBag,
    title: { de: 'Item Shop', en: 'Item Shop' },
    description: { de: 'Kaufe virtuelle Items', en: 'Buy virtual items' },
    color: 'text-green-400',
    keywords: 'virtual shop, items'
  },
  trading: {
    path: '/trading',
    icon: ArrowLeftRight,
    title: { de: 'Trading', en: 'Trading' },
    description: { de: 'Handle mit Spielern', en: 'Trade with players' },
    color: 'text-blue-400',
    keywords: 'trading simulator, item trading'
  },
  gamepass: {
    path: '/gamepass',
    icon: Star,
    title: { de: 'Game Pass', en: 'Game Pass' },
    description: { de: 'Exklusive Belohnungen', en: 'Exclusive rewards' },
    color: 'text-pink-400',
    keywords: 'game pass, rewards'
  },
  customization: {
    path: '/customization',
    icon: Gift,
    title: { de: 'Anpassung', en: 'Customization' },
    description: { de: 'Personalisiere dein Profil', en: 'Personalize your profile' },
    color: 'text-cyan-400',
    keywords: 'customization, cosmetics'
  },
  inventory: {
    path: '/inventory',
    icon: ShoppingBag,
    title: { de: 'Inventar', en: 'Inventory' },
    description: { de: 'Deine Items', en: 'Your items' },
    color: 'text-orange-400',
    keywords: 'inventory, items'
  }
};

// Related Pages Section - for bottom of pages
export const RelatedPages = ({ currentPath }) => {
  const { language } = useLanguage();
  const relatedKeys = RELATED_PAGES[currentPath] || RELATED_PAGES['/'];
  
  return (
    <nav 
      aria-label="Related pages" 
      className="mt-12 pt-8 border-t border-white/10"
    >
      <h2 className="text-lg font-semibold text-white mb-4">
        {language === 'de' ? 'Entdecke mehr' : 'Discover more'}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {relatedKeys.map(key => {
          const page = PAGE_INFO[key];
          if (!page) return null;
          const Icon = page.icon;
          
          return (
            <Link
              key={key}
              to={page.path}
              className="group p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-white/20"
              title={page.keywords}
            >
              <Icon className={`w-6 h-6 ${page.color} mb-2 group-hover:scale-110 transition-transform`} />
              <h3 className="text-white font-medium text-sm">
                {page.title[language]}
              </h3>
              <p className="text-white/50 text-xs mt-1">
                {page.description[language]}
              </p>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

// Quick Navigation Bar - for header/sidebar
export const QuickNav = ({ exclude = [] }) => {
  const { language } = useLanguage();
  const pages = Object.entries(PAGE_INFO).filter(([key]) => !exclude.includes(key));
  
  return (
    <nav aria-label="Quick navigation" className="flex flex-wrap gap-2">
      {pages.slice(0, 5).map(([key, page]) => {
        const Icon = page.icon;
        return (
          <Link
            key={key}
            to={page.path}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm ${page.color} hover:text-white transition-colors`}
            title={page.keywords}
          >
            <Icon className="w-4 h-4" />
            <span>{page.title[language]}</span>
          </Link>
        );
      })}
    </nav>
  );
};

// Breadcrumb Navigation - improves SEO structure
export const Breadcrumbs = ({ items }) => {
  const { language } = useLanguage();
  
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol 
        className="flex items-center gap-2 text-sm text-white/60"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        <li
          itemProp="itemListElement"
          itemScope
          itemType="https://schema.org/ListItem"
        >
          <Link 
            to="/" 
            className="hover:text-white transition-colors"
            itemProp="item"
          >
            <span itemProp="name">Home</span>
          </Link>
          <meta itemProp="position" content="1" />
        </li>
        
        {items.map((item, index) => (
          <li
            key={item.path}
            className="flex items-center gap-2"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            <span className="text-white/30">/</span>
            {index === items.length - 1 ? (
              <span className="text-white" itemProp="name">{item.name}</span>
            ) : (
              <Link 
                to={item.path} 
                className="hover:text-white transition-colors"
                itemProp="item"
              >
                <span itemProp="name">{item.name}</span>
              </Link>
            )}
            <meta itemProp="position" content={String(index + 2)} />
          </li>
        ))}
      </ol>
    </nav>
  );
};

// Footer Links Section - important for SEO
export const FooterLinks = () => {
  const { language } = useLanguage();
  
  const sections = [
    {
      title: { de: 'Spiele', en: 'Games' },
      links: [
        { key: 'slots', label: { de: 'Slot Machines', en: 'Slot Machines' } },
        { key: 'wheel', label: { de: 'Glücksrad', en: 'Lucky Wheel' } },
      ]
    },
    {
      title: { de: 'Community', en: 'Community' },
      links: [
        { key: 'leaderboard', label: { de: 'Bestenliste', en: 'Leaderboard' } },
        { key: 'trading', label: { de: 'Trading', en: 'Trading' } },
      ]
    },
    {
      title: { de: 'Items', en: 'Items' },
      links: [
        { key: 'shop', label: { de: 'Shop', en: 'Shop' } },
        { key: 'gamepass', label: { de: 'Game Pass', en: 'Game Pass' } },
      ]
    }
  ];
  
  return (
    <div className="grid grid-cols-3 gap-8">
      {sections.map((section, idx) => (
        <div key={idx}>
          <h3 className="text-white font-semibold mb-3">
            {section.title[language]}
          </h3>
          <ul className="space-y-2">
            {section.links.map(link => {
              const page = PAGE_INFO[link.key];
              return (
                <li key={link.key}>
                  <Link 
                    to={page.path}
                    className="text-white/60 hover:text-white text-sm transition-colors"
                  >
                    {link.label[language]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default RelatedPages;
