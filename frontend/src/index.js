import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { onCLS, onLCP, onFCP, onTTFB, onINP } from 'web-vitals';

// =============================================================================
// WEB VITALS TRACKING - Monitor Core Web Vitals for SEO
// =============================================================================

const reportWebVitals = (metric) => {
  // Only log in development or send to analytics in production
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}:`, metric.value.toFixed(2), metric.rating);
  }
};

// Track all Core Web Vitals
onCLS(reportWebVitals);   // Cumulative Layout Shift
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
