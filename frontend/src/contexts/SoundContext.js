import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SoundContext = createContext();

// Default settings
const DEFAULT_SETTINGS = {
  soundEnabled: true,
  volume: 60,
  hoverSoundsEnabled: true
};

const STORAGE_KEY = 'goladium_audio_settings';

export const SoundProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [userInteracted, setUserInteracted] = useState(false);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Initialize Web Audio API
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.setValueAtTime(settings.volume / 100, audioContextRef.current.currentTime);
      return audioContextRef.current;
    } catch (e) {
      console.error('Audio init failed:', e);
      return null;
    }
  }, [settings.volume]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        settings.soundEnabled ? settings.volume / 100 : 0,
        audioContextRef.current.currentTime
      );
    }
  }, [settings.soundEnabled, settings.volume]);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Track user interaction
  const handleUserInteraction = useCallback(() => {
    if (!userInteracted) {
      setUserInteracted(true);
      const ctx = initAudioContext();
      if (ctx?.state === 'suspended') ctx.resume();
    }
  }, [userInteracted, initAudioContext]);

  useEffect(() => {
    const handler = () => handleUserInteraction();
    ['click', 'keydown', 'touchstart'].forEach(e => 
      document.addEventListener(e, handler, { once: true })
    );
    return () => ['click', 'keydown', 'touchstart'].forEach(e => 
      document.removeEventListener(e, handler)
    );
  }, [handleUserInteraction]);

  // === SOUND EFFECTS ===

  // Generic hover sound - subtle tick
  const playHover = useCallback(() => {
    if (!settings.soundEnabled || !settings.hoverSoundsEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.03);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }, [settings.soundEnabled, settings.hoverSoundsEnabled, userInteracted, initAudioContext]);

  // Generic click sound
  const playClick = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // SPIN sound - slot machine / wheel
  const playSpin = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Whoosh + tick sequence
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // WIN sound - celebration
  const playWin = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Ascending arpeggio - triumphant
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.3);
      
      osc.connect(gain);
      gain.connect(gainNodeRef.current);
      osc.start(ctx.currentTime + i * 0.07);
      osc.stop(ctx.currentTime + i * 0.07 + 0.3);
    });
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // BIG WIN / JACKPOT sound - epic
  const playJackpot = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Epic fanfare with harmonics
    const chords = [
      [261.63, 329.63, 392.00], // C major
      [293.66, 369.99, 440.00], // D major
      [329.63, 415.30, 493.88], // E major
      [349.23, 440.00, 523.25], // F major
      [392.00, 493.88, 587.33], // G major
      [523.25, 659.25, 783.99], // C major (octave up)
    ];

    chords.forEach((chord, chordIdx) => {
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + chordIdx * 0.12);
        
        gain.gain.setValueAtTime(0.15, ctx.currentTime + chordIdx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + chordIdx * 0.12 + 0.25);
        
        osc.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start(ctx.currentTime + chordIdx * 0.12);
        osc.stop(ctx.currentTime + chordIdx * 0.12 + 0.25);
      });
    });
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // PURCHASE / coin sound
  const playPurchase = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Coin clink
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.1);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(3500, ctx.currentTime + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(gainNodeRef.current);
    
    osc.start();
    osc2.start(ctx.currentTime + 0.05);
    osc.stop(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.2);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // ERROR sound
  const playError = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(100, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // LEVEL UP / achievement
  const playLevelUp = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Magical ascending
    const notes = [392, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime + i * 0.1);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.35);
      
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(gainNodeRef.current);
      
      osc.start(ctx.currentTime + i * 0.1);
      osc2.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.35);
      osc2.stop(ctx.currentTime + i * 0.1 + 0.35);
    });
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // CHEST OPEN sound
  const playChestOpen = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    // Creaky open + sparkle
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);

    // Sparkle
    setTimeout(() => {
      if (!audioContextRef.current) return;
      const sparkleNotes = [1500, 2000, 2500, 3000];
      sparkleNotes.forEach((freq, i) => {
        const o = audioContextRef.current.createOscillator();
        const g = audioContextRef.current.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, audioContextRef.current.currentTime + i * 0.05);
        g.gain.setValueAtTime(0.1, audioContextRef.current.currentTime + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + i * 0.05 + 0.15);
        o.connect(g);
        g.connect(gainNodeRef.current);
        o.start(audioContextRef.current.currentTime + i * 0.05);
        o.stop(audioContextRef.current.currentTime + i * 0.05 + 0.15);
      });
    }, 200);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // WHEEL TICK sound (for wheel spinning)
  const playWheelTick = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // NAV / menu sound
  const playNav = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = initAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }, [settings.soundEnabled, userInteracted, initAudioContext]);

  // Settings setters
  const setSoundEnabled = useCallback((enabled) => {
    setSettings(s => ({ ...s, soundEnabled: enabled }));
  }, []);

  const setVolume = useCallback((volume) => {
    setSettings(s => ({ ...s, volume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  const setHoverSoundsEnabled = useCallback((enabled) => {
    setSettings(s => ({ ...s, hoverSoundsEnabled: enabled }));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const value = {
    settings,
    userInteracted,
    
    // Sounds
    playHover,
    playClick,
    playSpin,
    playWin,
    playJackpot,
    playPurchase,
    playError,
    playLevelUp,
    playChestOpen,
    playWheelTick,
    playNav,
    
    // Settings
    setSoundEnabled,
    setVolume,
    setHoverSoundsEnabled,
    handleUserInteraction
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};

export default SoundContext;
