import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { handleGoogleCallback } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      try {
        const hash = window.location.hash;
        
        if (!hash || !hash.includes('session_id=')) {
          navigate('/', { replace: true });
          return;
        }
        
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          navigate('/', { replace: true });
          return;
        }

        await handleGoogleCallback(sessionId);
        navigate('/dashboard', { replace: true });
      } catch (error) {
        navigate('/', { replace: true });
      }
    };

    processCallback();
  }, [navigate, handleGoogleCallback]);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 font-mono">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
