import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from './components/ui/sonner';

// Pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import SlotMachine from './pages/SlotMachine';
import SlotsHub from './pages/SlotsHub';
import Jackpot from './pages/Jackpot';
import LuckyWheel from './pages/LuckyWheel';
import Leaderboards from './pages/Leaderboards';
import Shop from './pages/Shop';
import Inventory from './pages/Inventory';
import PrestigeShop from './pages/PrestigeShop';
import Customization from './pages/Customization';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Trading from './pages/Trading';
import AuthCallback from './components/AuthCallback';

// Protected Route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  // Check React state first, then sessionStorage fallback for Google OAuth
  // This handles the race condition where React state hasn't updated yet
  const isAuthenticated = user || sessionStorage.getItem('goladium_user');
  
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};

// App Router with session_id detection
const AppRouter = () => {
  const location = useLocation();

  // Check URL fragment for session_id (Google OAuth callback)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/slots"
        element={
          <ProtectedRoute>
            <SlotsHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/slots/:slotId"
        element={
          <ProtectedRoute>
            <SlotMachine />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jackpot"
        element={
          <ProtectedRoute>
            <Jackpot />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wheel"
        element={
          <ProtectedRoute>
            <LuckyWheel />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaderboards"
        element={
          <ProtectedRoute>
            <Leaderboards />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shop"
        element={
          <ProtectedRoute>
            <Shop />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <Inventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/prestige-shop"
        element={
          <ProtectedRoute>
            <PrestigeShop />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customization"
        element={
          <ProtectedRoute>
            <Customization />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trading"
        element={
          <ProtectedRoute>
            <Trading />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <div className="min-h-screen bg-[#050505]">
            <AppRouter />
            <Toaster 
              position="top-right" 
              toastOptions={{
                style: {
                  background: '#0A0A0C',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff'
                }
              }}
            />
          </div>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
