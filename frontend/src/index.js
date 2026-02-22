import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { onCLS, onFID, onLCP, onFCP, onTTFB, onINP } from 'web-vitals';

// =============================================================================
// WEB VITALS TRACKING - Monitor Core Web Vitals for SEO
// =============================================================================

const reportWebVitals = (metric) => {
  // Only log in development or send to analytics in production
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}:`, metric.value.toFixed(2), metric.rating);
  }
  
  // Send to analytics endpoint in production
  if (process.env.NODE_ENV === 'production' && metric.rating !== 'good') {
    // You can send this to your analytics
    // fetch('/api/analytics/vitals', {
    //   method: 'POST',
    //   body: JSON.stringify(metric),
    //   headers: { 'Content-Type': 'application/json' }
    // });
  }
};

// Track all Core Web Vitals
onCLS(reportWebVitals);   // Cumulative Layout Shift
onFID(reportWebVitals);   // First Input Delay (deprecated, use INP)
onLCP(reportWebVitals);   // Largest Contentful Paint
onFCP(reportWebVitals);   // First Contentful Paint
onTTFB(reportWebVitals);  // Time to First Byte
onINP(reportWebVitals);   // Interaction to Next Paint

// =============================================================================
// PERFORMANCE OPTIMIZATIONS
// =============================================================================

// Remove loading screen when React hydrates
const removeLoadingScreen = () => {
  const loadingScreen = document.querySelector('.loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.3s ease';
    setTimeout(() => loadingScreen.remove(), 300);
  }
};

// Preload critical routes
const prefetchRoutes = () => {
  // Prefetch likely navigation targets after initial load
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      const routes = ['/slots', '/wheel', '/leaderboard'];
      routes.forEach(route => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = route;
        document.head.appendChild(link);
      });
    });
  }
};

// =============================================================================
// RENDER APP
// =============================================================================

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Post-render optimizations
removeLoadingScreen();

// Prefetch after initial paint
if (document.readyState === 'complete') {
  prefetchRoutes();
} else {
  window.addEventListener('load', prefetchRoutes);
}
