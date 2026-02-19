import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AlertTriangle } from 'lucide-react';
import { Link } from "react-router-dom";

const Footer = () => {
  const { language } = useLanguage();
  
  return (
    <footer className="w-full bg-slate-950 border-t border-slate-800 py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* 18+ Age Restriction Notice */}
          <div className="flex items-center gap-2 text-amber-400">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-500">
              <span className="text-sm font-bold">18+</span>
            </div>
            <span className="text-sm font-medium">
              {language === 'de' 
                ? 'Nur für Erwachsene ab 18 Jahren' 
                : 'For Adults 18+ Only'}
            </span>
          </div>
          
          {/* Center - Brand + Privacy */}
           <div className="flex items-center gap-4 text-slate-500 text-sm">
             <span>
               © {new Date().getFullYear()} Goladium
             </span>
             <Link
               to="/privacy"
               className="px-3 py-1 rounded-md border border-teal-500/40 text-teal-400 hover:bg-teal-500/10 transition duration-200 font-medium"
             >
               {language === "de" ? "Datenschutz" : "Privacy Policy"}
             </Link>
           </div>

          
          {/* Right - Simulation Notice */}
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>
              {language === 'de' 
                ? 'Simulation ohne echten Geldwert' 
                : 'Simulation with no real value'}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
