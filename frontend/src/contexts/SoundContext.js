import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SoundContext = createContext();

// Sound files - place your MP3 files in /public/sounds/
const SOUNDS = {
  hover: '/sounds/hover.mp3',        // Short tick/click (~0.1s)
  click: '/sounds/click.mp3',        // Button click (~0.1s)
  spin: '/sounds/spin.mp3',          // Slot spin start (~0.3s)
  win: '/sounds/win.mp3',            // Small win (~0.5s)
  jackpot: '/sounds/jackpot.mp3',    // Big win/jackpot (~1-2s)
  purchase: '/sounds/purchase.mp3',  // Coin/purchase (~0.3s)
  error: '/sounds/error.mp3',        // Error buzz (~0.2s)
  levelup: '/sounds/levelup.mp3',    // Level up fanfare (~1s)
  chest: '/sounds/chest.mp3',        // Chest open (~0.5s)
  wheel: '/sounds/wheel.mp3',        // Wheel tick (~0.05s)
  nav: '/sounds/nav.mp3',            // Navigation swoosh (~0.1s)
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
  const audioCache = useRef({});

  // Preload sounds
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, src]) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = src;
      audioCache.current[key] = audio;
    });
  }, []);

  // Save settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Track user interaction
  const handleUserInteraction = useCallback(() => {
    if (!userInteracted) setUserInteracted(true);
  }, [userInteracted]);

  useEffect(() => {
    const handler = () => handleUserInteraction();
    ['click', 'keydown', 'touchstart'].forEach(e => 
      document.addEventListener(e, handler, { once: true })
    );
    return () => ['click', 'keydown', 'touchstart'].forEach(e => 
      document.removeEventListener(e, handler)
    );
  }, [handleUserInteraction]);

  // Play sound function
  const playSound = useCallback((soundKey) => {
    if (!settings.soundEnabled || !userInteracted) return;
    if (soundKey === 'hover' && !settings.hoverSoundsEnabled) return;

    try {
      // Clone audio to allow overlapping sounds
      const audio = new Audio(SOUNDS[soundKey]);
      audio.volume = settings.volume / 100;
      audio.play().catch(() => {}); // Ignore autoplay errors
    } catch (e) {
      console.warn('Sound play failed:', soundKey, e);
    }
  }, [settings.soundEnabled, settings.volume, settings.hoverSoundsEnabled, userInteracted]);

  // Individual sound functions
  const playHover = useCallback(() => playSound('hover'), [playSound]);
  const playClick = useCallback(() => playSound('click'), [playSound]);
  const playSpin = useCallback(() => playSound('spin'), [playSound]);
  const playWin = useCallback(() => playSound('win'), [playSound]);
  const playJackpot = useCallback(() => playSound('jackpot'), [playSound]);
  const playPurchase = useCallback(() => playSound('purchase'), [playSound]);
  const playError = useCallback(() => playSound('error'), [playSound]);
  const playLevelUp = useCallback(() => playSound('levelup'), [playSound]);
  const playChestOpen = useCallback(() => playSound('chest'), [playSound]);
  const playWheelTick = useCallback(() => playSound('wheel'), [playSound]);
  const playNav = useCallback(() => playSound('nav'), [playSound]);

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

  return (
    <SoundContext.Provider value={{
      settings,
      userInteracted,
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
