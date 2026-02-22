import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SoundContext = createContext();

// Music tracks - Add your own MP3/OGG files to /public/sounds/
// Example: /public/sounds/lounge.mp3
const MUSIC_TRACKS = {
  'lounge': {
    name: 'Casino Lounge',
    description: 'Relaxed ambient vibes',
    file: '/sounds/lounge.mp3'
  },
  'jazz': {
    name: 'Smooth Jazz', 
    description: 'Classic casino atmosphere',
    file: '/sounds/jazz.mp3'
  },
  'electronic': {
    name: 'Chill Electronic',
    description: 'Modern ambient beats',
    file: '/sounds/electronic.mp3'
  },
  'none': {
    name: 'No Music',
    description: 'Silence',
    file: null
  }
};

// Default settings
const DEFAULT_SETTINGS = {
  masterEnabled: true,
  masterVolume: 70,
  musicVolume: 40,
  effectsVolume: 60,
  currentTrack: 'none',
  hoverSoundsEnabled: true
};

const STORAGE_KEY = 'goladium_audio_settings';

export const SoundProvider = ({ children }) => {
  // Audio state
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Track if user has interacted (for autoplay policy)
  const [userInteracted, setUserInteracted] = useState(false);
  
  // Audio refs
  const musicPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const effectsGainRef = useRef(null);

  // Initialize Audio Context for effects
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      effectsGainRef.current = audioContextRef.current.createGain();
      effectsGainRef.current.connect(audioContextRef.current.destination);
      return audioContextRef.current;
    } catch (e) {
      console.error('Failed to initialize audio:', e);
      return null;
    }
  }, []);

  // Update music volume
  useEffect(() => {
    if (musicPlayerRef.current) {
      const effectiveVolume = settings.masterEnabled 
        ? (settings.masterVolume / 100) * (settings.musicVolume / 100)
        : 0;
      musicPlayerRef.current.volume = effectiveVolume;
    }
  }, [settings.masterEnabled, settings.masterVolume, settings.musicVolume]);

  // Update effects volume
  useEffect(() => {
    if (effectsGainRef.current && audioContextRef.current) {
      const effectiveVolume = settings.masterEnabled
        ? (settings.masterVolume / 100) * (settings.effectsVolume / 100)
        : 0;
      effectsGainRef.current.gain.setValueAtTime(effectiveVolume, audioContextRef.current.currentTime);
    }
  }, [settings.masterEnabled, settings.masterVolume, settings.effectsVolume]);

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save audio settings:', e);
    }
  }, [settings]);

  // Handle user interaction for autoplay
  const handleUserInteraction = useCallback(() => {
    if (!userInteracted) {
      setUserInteracted(true);
      const ctx = initAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  }, [userInteracted, initAudioContext]);

  // Track user interaction
  useEffect(() => {
    const handleInteraction = () => handleUserInteraction();
    
    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, [handleUserInteraction]);

  // Play background music
  const playMusic = useCallback((trackId) => {
    // Stop current music
    if (musicPlayerRef.current) {
      musicPlayerRef.current.pause();
      musicPlayerRef.current.src = '';
      musicPlayerRef.current = null;
    }

    if (trackId === 'none' || !MUSIC_TRACKS[trackId] || !MUSIC_TRACKS[trackId].file) {
      setSettings(s => ({ ...s, currentTrack: 'none' }));
      return;
    }

    try {
      const audio = new Audio(MUSIC_TRACKS[trackId].file);
      audio.loop = true;
      
      const effectiveVolume = settings.masterEnabled 
        ? (settings.masterVolume / 100) * (settings.musicVolume / 100)
        : 0;
      audio.volume = effectiveVolume;
      
      audio.play().catch(err => {
        console.log('Music autoplay blocked, will play on interaction:', err);
      });
      
      musicPlayerRef.current = audio;
      setSettings(s => ({ ...s, currentTrack: trackId }));
    } catch (e) {
      console.error('Failed to play music:', e);
    }
  }, [settings.masterEnabled, settings.masterVolume, settings.musicVolume]);

  // Stop music
  const stopMusic = useCallback(() => {
    if (musicPlayerRef.current) {
      musicPlayerRef.current.pause();
      musicPlayerRef.current.src = '';
      musicPlayerRef.current = null;
    }
    setSettings(s => ({ ...s, currentTrack: 'none' }));
  }, []);

  // Play hover sound (short tick)
  const playHoverSound = useCallback(() => {
    if (!settings.masterEnabled || !settings.hoverSoundsEnabled || !userInteracted) return;
    
    const ctx = initAudioContext();
    if (!ctx || !effectsGainRef.current) return;

    // Short click sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(effectsGainRef.current);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }, [settings.masterEnabled, settings.hoverSoundsEnabled, userInteracted, initAudioContext]);

  // Play effect sound
  const playEffect = useCallback((effectType) => {
    if (!settings.masterEnabled || !userInteracted) return;
    
    const ctx = initAudioContext();
    if (!ctx || !effectsGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    switch (effectType) {
      case 'win':
        // Ascending arpeggio
        const winNotes = [523.25, 659.25, 783.99, 1046.50];
        winNotes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
          g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.25);
          o.connect(g);
          g.connect(effectsGainRef.current);
          o.start(ctx.currentTime + i * 0.08);
          o.stop(ctx.currentTime + i * 0.08 + 0.25);
        });
        return;

      case 'spin':
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        break;

      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        break;

      case 'purchase':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        break;

      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        break;

      case 'levelup':
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
          g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
          o.connect(g);
          g.connect(effectsGainRef.current);
          o.start(ctx.currentTime + i * 0.1);
          o.stop(ctx.currentTime + i * 0.1 + 0.3);
        });
        return;

      default:
        return;
    }

    osc.connect(gain);
    gain.connect(effectsGainRef.current);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }, [settings.masterEnabled, userInteracted, initAudioContext]);

  // Settings updaters
  const setMasterEnabled = useCallback((enabled) => {
    setSettings(s => ({ ...s, masterEnabled: enabled }));
    if (!enabled) {
      stopMusic();
    }
  }, [stopMusic]);

  const setMasterVolume = useCallback((volume) => {
    setSettings(s => ({ ...s, masterVolume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  const setMusicVolume = useCallback((volume) => {
    setSettings(s => ({ ...s, musicVolume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  const setEffectsVolume = useCallback((volume) => {
    setSettings(s => ({ ...s, effectsVolume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  const setHoverSoundsEnabled = useCallback((enabled) => {
    setSettings(s => ({ ...s, hoverSoundsEnabled: enabled }));
  }, []);

  const selectTrack = useCallback((trackId) => {
    playMusic(trackId);
  }, [playMusic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const value = {
    settings,
    userInteracted,
    musicTracks: MUSIC_TRACKS,
    
    playHoverSound,
    playEffect,
    playMusic,
    stopMusic,
    
    setMasterEnabled,
    setMasterVolume,
    setMusicVolume,
    setEffectsVolume,
    setHoverSoundsEnabled,
    selectTrack,
    
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
