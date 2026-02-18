import React, { useEffect, useRef, useCallback, useState } from 'react';

const TURNSTILE_SITE_KEY = '0x4AAAAAACe1N52m--oWjkoY';

const Turnstile = ({ onVerify, onError, onExpire }) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleCallback = useCallback((token) => {
    console.log('[Turnstile] Token received:', token?.substring(0, 20) + '...');
    if (onVerify) onVerify(token);
  }, [onVerify]);

  const handleError = useCallback((errorCode) => {
    console.error('[Turnstile] Error:', errorCode);
    if (onError) onError(errorCode);
  }, [onError]);

  const handleExpire = useCallback(() => {
    console.log('[Turnstile] Token expired');
    if (onExpire) onExpire();
  }, [onExpire]);

  // Cleanup function
  const cleanupWidget = useCallback(() => {
    if (widgetIdRef.current !== null && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
        console.log('[Turnstile] Widget removed');
      } catch (e) {
        console.log('[Turnstile] Cleanup error (ignored):', e);
      }
      widgetIdRef.current = null;
    }
  }, []);

  // Render widget function
  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) {
      console.log('[Turnstile] Cannot render - container or turnstile not ready');
      return;
    }

    // Clean up existing widget first
    cleanupWidget();

    try {
      console.log('[Turnstile] Rendering widget...');
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: handleCallback,
        'error-callback': handleError,
        'expired-callback': handleExpire,
        theme: 'dark',
        size: 'normal',
        retry: 'auto',
        'retry-interval': 5000,
        'refresh-expired': 'auto'
      });
      setIsLoading(false);
      console.log('[Turnstile] Widget rendered with ID:', widgetIdRef.current);
    } catch (e) {
      console.error('[Turnstile] Render error:', e);
      setIsLoading(false);
    }
  }, [handleCallback, handleError, handleExpire, cleanupWidget]);

  // Load script and render
  useEffect(() => {
    let isMounted = true;

    const initTurnstile = () => {
      if (!isMounted) return;

      if (window.turnstile) {
        renderWidget();
      } else {
        // Check if script is already loading
        const existingScript = document.querySelector('script[src*="turnstile"]');
        if (existingScript) {
          existingScript.addEventListener('load', () => {
            if (isMounted) renderWidget();
          });
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => {
          console.log('[Turnstile] Script loaded');
          if (isMounted) {
            // Small delay to ensure turnstile is ready
            setTimeout(renderWidget, 100);
          }
        };
        script.onerror = () => {
          console.error('[Turnstile] Script failed to load');
          setIsLoading(false);
        };
        document.head.appendChild(script);
      }
    };

    initTurnstile();

    return () => {
      isMounted = false;
      cleanupWidget();
    };
  }, [renderWidget, cleanupWidget]);

  // Re-render when resetKey changes (for tab switching)
  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        ref={containerRef} 
        className="cf-turnstile"
        data-testid="turnstile-widget"
      />
      {isLoading && (
        <div className="text-white/40 text-xs">Loading verification...</div>
      )}
    </div>
  );
};

export default Turnstile;
