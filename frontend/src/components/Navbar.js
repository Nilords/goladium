import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/formatCurrency';
import { 
  Home, 
  Gamepad2, 
  CircleDot, 
  User, 
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Trophy,
  ShoppingBag,
  Package,
  Crown,
  Palette,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { BarChart3 } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Lobby', icon: Home },
    { path: '/leaderboards', label: language === 'de' ? 'Rangliste' : 'Ranks', icon: BarChart3 },
    { path: '/slots/classic', label: 'Slots', icon: Gamepad2 },
    { path: '/jackpot', label: 'Jackpot', icon: Trophy },
    { path: '/wheel', label: language === 'de' ? 'Glücksrad' : 'Wheel', icon: CircleDot },
    { path: '/shop', label: 'Shop', icon: ShoppingBag },
    { path: '/prestige-shop', label: 'Prestige', icon: Crown },
    { path: '/trading', label: 'Trading', icon: ArrowLeftRight },
  ];

  const isActive = (path) => {
    if (path === '/slots/classic') {
      return location.pathname.startsWith('/slots');
    }
    return location.pathname === path;
  };

  return (
    <>
      {/* Disclaimer Bar */}
      <div className="disclaimer-bar">
        {t('disclaimer')}
      </div>

      {/* Main Navbar */}
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center transform group-hover:scale-105 transition-transform">
                <span className="text-black font-bold text-xl font-mono">G</span>
              </div>
              <span className="text-xl font-bold text-white hidden sm:block">
                {t('app_name')}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  data-testid={`nav-${item.path.slice(1)}`}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-all duration-200 whitespace-nowrap h-9 ${
                    isActive(item.path)
                      ? 'bg-primary/25 text-primary border border-primary/40'
                      : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/15 border border-white/20 hover:border-white/30'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Balance & User */}
            <div className="flex items-center space-x-4">
              {/* G Balance Display */}
              <div className="hidden sm:flex items-center space-x-2 px-3 py-2 rounded-lg bg-black/50 border border-gold/30">
                <span className="text-gold font-mono text-lg font-bold" data-testid="user-balance">
                  {formatCurrency(user?.balance)}
                </span>
                <span className="text-gold/60 text-sm">G</span>
              </div>
              
              {/* A Balance Display */}
              <div className="hidden sm:flex items-center space-x-2 px-3 py-2 rounded-lg bg-black/50 border border-primary/30">
                <span className="text-primary font-mono text-lg font-bold" data-testid="user-prestige-balance">
                  {(user?.balance_a || 0).toFixed(0)}
                </span>
                <span className="text-primary/60 text-sm">A</span>
              </div>

              {/* Language Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => changeLanguage(language === 'en' ? 'de' : 'en')}
                className="bg-white/10 text-white/80 hover:text-white hover:bg-white/15 border border-white/20 hover:border-white/30"
                data-testid="language-toggle"
              >
                {language.toUpperCase()}
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30" data-testid="user-menu-trigger">
                    <Avatar className="h-9 w-9 border-2 border-primary/50">
                      <AvatarImage src={user?.avatar} alt={user?.username} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#0A0A0C] border-white/10" align="end">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      <p className="font-medium text-white">{user?.username}</p>
                      <p className="text-xs text-white/60">{t('level')} {user?.level || 1}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild className="text-white/80 hover:text-white focus:text-white cursor-pointer">
                    <Link to="/inventory" className="flex items-center">
                      <Package className="mr-2 h-4 w-4" />
                      {language === 'de' ? 'Inventar' : 'Inventory'}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-white/80 hover:text-white focus:text-white cursor-pointer">
                    <Link to="/customization" className="flex items-center">
                      <Palette className="mr-2 h-4 w-4" />
                      {language === 'de' ? 'Anpassung' : 'Customization'}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-white/80 hover:text-white focus:text-white cursor-pointer">
                    <Link to="/profile" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      {t('profile')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-white/80 hover:text-white focus:text-white cursor-pointer">
                    <Link to="/settings" className="flex items-center">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      {t('settings')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem 
                    onClick={logout}
                    className="text-red-400 hover:text-red-300 focus:text-red-300 cursor-pointer"
                    data-testid="logout-btn"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="mobile-menu-toggle"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/20 animate-fade-in bg-black/50">
            <div className="px-4 py-4 space-y-2">
              {/* Mobile Balance */}
              <div className="flex items-center justify-center space-x-2 px-4 py-3 rounded-lg bg-black/50 border border-gold/30 mb-4">
                <span className="text-gold font-mono text-xl font-bold">
                  {formatCurrency(user?.balance)}
                </span>
                <span className="text-gold/60">G</span>
              </div>
              
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive(item.path)
                      ? 'bg-primary/25 text-primary border border-primary/40'
                      : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/15 border border-white/20 hover:border-white/30'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default Navbar;
