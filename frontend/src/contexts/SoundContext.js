import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SoundContext = createContext();

// Sound files for complex sounds - place in /public/sounds/
const SOUND_FILES = {
  spin: '/sounds/spin.mp3',
  win: '/sounds/win.mp3',
  jackpot: '/sounds/jackpot.mp3',
  purchase: '/sounds/purchase.mp3',
  levelup: '/sounds/levelup.mp3',
  chest: '/sounds/chest.mp3',
};

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
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
      } catch (e) {
        console.error('Audio init failed:', e);
        return null;
      }
    }
    
    // Resume if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    // Update gain
    if (gainNodeRef.current) {
      const vol = settings.soundEnabled ? settings.volume / 100 : 0;
      gainNodeRef.current.gain.setValueAtTime(vol, audioContextRef.current.currentTime);
    }
    
    return audioContextRef.current;
  }, [settings.soundEnabled, settings.volume]);

  // Save settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Track user interaction
  const handleUserInteraction = useCallback(() => {
    if (!userInteracted) {
      setUserInteracted(true);
      getAudioContext(); // Initialize on first interaction
    }
  }, [userInteracted, getAudioContext]);

  useEffect(() => {
    const handler = () => handleUserInteraction();
    ['click', 'keydown', 'touchstart'].forEach(e => 
      document.addEventListener(e, handler, { once: true })
    );
    return () => ['click', 'keydown', 'touchstart'].forEach(e => 
      document.removeEventListener(e, handler)
    );
  }, [handleUserInteraction]);

  // Global click sound for ALL buttons
  useEffect(() => {
    const handleGlobalClick = (e) => {
      // Check if clicked element is a button or inside a button
      const button = e.target.closest('button, [role="button"], a.btn, .btn');
      if (button && settings.soundEnabled && userInteracted) {
        // Play click sound
        const ctx = audioContextRef.current;
        if (!ctx || !gainNodeRef.current) return;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [settings.soundEnabled, userInteracted]);

  // Global hover sound for buttons
  useEffect(() => {
    const handleGlobalHover = (e) => {
      const button = e.target.closest('button, [role="button"]');
      if (button && settings.soundEnabled && settings.hoverSoundsEnabled && userInteracted) {
        const ctx = audioContextRef.current;
        if (!ctx || !gainNodeRef.current) return;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.04);
        
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        
        osc.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
    };

    document.addEventListener('mouseenter', handleGlobalHover, true);
    return () => document.removeEventListener('mouseenter', handleGlobalHover, true);
  }, [settings.soundEnabled, settings.hoverSoundsEnabled, userInteracted]);

  // ============ GENERATED SOUNDS (Web Audio API) ============

  // HOVER - subtle high tick
  const playHover = useCallback(() => {
    if (!settings.soundEnabled || !settings.hoverSoundsEnabled || !userInteracted) return;
    const ctx = getAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.04);
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }, [settings.soundEnabled, settings.hoverSoundsEnabled, userInteracted, getAudioContext]);

  // CLICK - satisfying pop
  const playClick = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = getAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, [settings.soundEnabled, userInteracted, getAudioContext]);

  // ERROR - low buzz
  const playError = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = getAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.setValueAtTime(120, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, [settings.soundEnabled, userInteracted, getAudioContext]);

  // NAV - swoosh
  const playNav = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = getAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, [settings.soundEnabled, userInteracted, getAudioContext]);

  // WHEEL TICK - rapid tick for spinning wheel
  const playWheelTick = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    const ctx = getAudioContext();
    if (!ctx || !gainNodeRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    
    osc.connect(gain);
    gain.connect(gainNodeRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  }, [settings.soundEnabled, userInteracted, getAudioContext]);

  // ============ FILE-BASED SOUNDS (MP3) ============
  
  const playFile = useCallback((soundKey) => {
    if (!settings.soundEnabled || !userInteracted) return;
    if (!SOUND_FILES[soundKey]) return;

    try {
      const audio = new Audio(SOUND_FILES[soundKey]);
      audio.volume = settings.volume / 100;
      audio.play().catch(() => {
        // File not found or blocked - play fallback generated sound
        console.log(`Sound file ${soundKey} not available, using fallback`);
      });
    } catch (e) {
      console.warn('Sound play failed:', soundKey);
    }
  }, [settings.soundEnabled, settings.volume, userInteracted]);

  // SPIN - for slots/wheel (file-based with fallback)
  const playSpin = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    // Try file first
    const audio = new Audio(SOUND_FILES.spin);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: generated whoosh
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.4);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      
      osc.connect(gain);
      gain.connect(gainNodeRef.current);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // WIN - small win celebration (file-based with fallback)
  const playWin = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    const audio = new Audio(SOUND_FILES.win);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: ascending arpeggio
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.25);
      });
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // JACKPOT - big win (file-based with fallback)
  const playJackpot = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    const audio = new Audio(SOUND_FILES.jackpot);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: epic fanfare
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      const chords = [
        [262, 330, 392],
        [294, 370, 440],
        [330, 415, 494],
        [349, 440, 523],
        [392, 494, 587],
        [523, 659, 784],
      ];
      
      chords.forEach((chord, ci) => {
        chord.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + ci * 0.12);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + ci * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ci * 0.12 + 0.2);
          osc.connect(gain);
          gain.connect(gainNodeRef.current);
          osc.start(ctx.currentTime + ci * 0.12);
          osc.stop(ctx.currentTime + ci * 0.12 + 0.2);
        });
      });
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // PURCHASE - coin sound (file-based with fallback)
  const playPurchase = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    const audio = new Audio(SOUND_FILES.purchase);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: coin clink
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      [2400, 3200].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + i * 0.06 + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.15);
        osc.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start(ctx.currentTime + i * 0.06);
        osc.stop(ctx.currentTime + i * 0.06 + 0.15);
      });
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // LEVEL UP (file-based with fallback)
  const playLevelUp = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    const audio = new Audio(SOUND_FILES.levelup);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: magical ascend
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      const notes = [392, 523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc2.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(gainNodeRef.current);
        osc.start(ctx.currentTime + i * 0.1);
        osc2.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.3);
        osc2.stop(ctx.currentTime + i * 0.1 + 0.3);
      });
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // CHEST OPEN (file-based with fallback)
  const playChestOpen = useCallback(() => {
    if (!settings.soundEnabled || !userInteracted) return;
    
    const audio = new Audio(SOUND_FILES.chest);
    audio.volume = settings.volume / 100;
    audio.play().catch(() => {
      // Fallback: creak + sparkle
      const ctx = getAudioContext();
      if (!ctx || !gainNodeRef.current) return;
      
      // Creak
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(gainNodeRef.current);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      
      // Sparkle
      setTimeout(() => {
        const ctx2 = audioContextRef.current;
        if (!ctx2) return;
        [1800, 2400, 3000].forEach((freq, i) => {
          const o = ctx2.createOscillator();
          const g = ctx2.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, ctx2.currentTime + i * 0.05);
          g.gain.setValueAtTime(0.08, ctx2.currentTime + i * 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + i * 0.05 + 0.12);
          o.connect(g);
          g.connect(gainNodeRef.current);
          o.start(ctx2.currentTime + i * 0.05);
          o.stop(ctx2.currentTime + i * 0.05 + 0.12);
        });
      }, 200);
    });
  }, [settings.soundEnabled, settings.volume, userInteracted, getAudioContext]);

  // Settings
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

  return (
    <SoundContext.Provider value={{
      settings,
      userInteracted,
      // Generated sounds (always work)
      playHover,
      playClick,
      playError,
      playNav,
      playWheelTick,
      // File-based with fallback
      playSpin,
      playWin,
      playJackpot,
      playPurchase,
      playLevelUp,
      playChestOpen,
      // Settings
      setSoundEnabled,
      setVolume,
      setHoverSoundsEnabled,
      handleUserInteraction
    }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) throw new Error('useSound must be used within SoundProvider');
  return context;
};

export default SoundContext;
