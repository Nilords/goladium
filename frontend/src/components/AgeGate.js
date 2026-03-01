import React from 'react';
import { useSound } from '../contexts/SoundContext';

const AgeGate = ({ onConfirm }) => {
  const { handleUserInteraction } = useSound();

  const handleEnter = () => {
    handleUserInteraction(); // unlocks audio immediately
    sessionStorage.setItem('goladium_age_verified', 'true');
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center px-8 max-w-md w-full">
        {/* Logo / Icon */}
        <div className="text-6xl font-black text-white mb-2 tracking-tight">
          GOLADIUM
        </div>
        <div className="text-cyan-400 text-sm font-mono tracking-widest mb-12 uppercase">
          Virtual Casino Simulator
        </div>

        {/* Age badge */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-cyan-400/50 text-cyan-400 text-3xl font-black mb-8">
          18+
        </div>

        <p className="text-white/60 text-sm mb-8 leading-relaxed">
          This site contains simulated gambling content.<br />
          No real money is involved.
        </p>

        <button
          onClick={handleEnter}
          className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-lg rounded-lg transition-all duration-200 active:scale-95"
        >
          I am 18+ — Enter
        </button>

        <p className="text-white/20 text-xs mt-6">
          By entering you confirm you are of legal age in your country.
        </p>
      </div>
    </div>
  );
};

export default AgeGate;
