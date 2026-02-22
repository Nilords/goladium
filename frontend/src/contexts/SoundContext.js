import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SoundContext = createContext();

// Audio file URLs - using royalty-free sounds
const MUSIC_TRACKS = {
  'lounge': {
    name: 'Casino Lounge',
    description: 'Relaxed ambient vibes',
    // Using a simple sine wave oscillator for demo - replace with actual URLs in production
    type: 'generated'
  },
  'jazz': {
    name: 'Smooth Jazz',
    description: 'Classic casino atmosphere',
    type: 'generated'
  },
  'electronic': {
    name: 'Chill Electronic',
    description: 'Modern ambient beats',
    type: 'generated'
  },
  'none': {
    name: 'No Music',
    description: 'Silence',
    type: 'none'
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
  const audioContextRef = useRef(null);
  const musicGainRef = useRef(null);
  const effectsGainRef = useRef(null);
  const masterGainRef = useRef(null);
  const currentMusicRef = useRef(null);
  const hoverSoundRef = useRef(null);

  // Initialize Web Audio API
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();

      // Create gain nodes
      masterGainRef.current = audioContextRef.current.createGain();
      musicGainRef.current = audioContextRef.current.createGain();
      effectsGainRef.current = audioContextRef.current.createGain();

      // Connect: music/effects -> master -> destination
      musicGainRef.current.connect(masterGainRef.current);
      effectsGainRef.current.connect(masterGainRef.current);
      masterGainRef.current.connect(audioContextRef.current.destination);

      // Set initial volumes
      updateVolumes();

      return audioContextRef.current;
    } catch (e) {
      console.error('Failed to initialize audio:', e);
      return null;
    }
  }, []);

  // Update volume levels
  const updateVolumes = useCallback(() => {
    if (!masterGainRef.current) return;

    const masterVol = settings.masterEnabled ? settings.masterVolume / 100 : 0;
    const musicVol = settings.musicVolume / 100;
    const effectsVol = settings.effectsVolume / 100;

    masterGainRef.current.gain.setValueAtTime(masterVol, audioContextRef.current?.currentTime || 0);
    musicGainRef.current.gain.setValueAtTime(musicVol, audioContextRef.current?.currentTime || 0);
    effectsGainRef.current.gain.setValueAtTime(effectsVol, audioContextRef.current?.currentTime || 0);
  }, [settings.masterEnabled, settings.masterVolume, settings.musicVolume, settings.effectsVolume]);

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save audio settings:', e);
    }
  }, [settings]);

  // Update volumes when settings change
  useEffect(() => {
    updateVolumes();
  }, [updateVolumes]);

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

  // Generate ambient music using oscillators
  const generateAmbientMusic = useCallback((trackId) => {
    if (!audioContextRef.current || !musicGainRef.current) return null;

    const ctx = audioContextRef.current;
    
    // Create oscillators for ambient sound
    const oscillators = [];
    const gains = [];

    if (trackId === 'lounge') {
      // Warm pad sound
      const frequencies = [130.81, 164.81, 196.00, 261.63]; // C major chord
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.connect(gain);
        gain.connect(musicGainRef.current);
        oscillators.push(osc);
        gains.push(gain);
      });
    } else if (trackId === 'jazz') {
      // Jazz-like tones
      const frequencies = [146.83, 185.00, 220.00, 277.18]; // D minor 7
      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        osc.connect(gain);
        gain.connect(musicGainRef.current);
        oscillators.push(osc);
        gains.push(gain);
      });
    } else if (trackId === 'electronic') {
      // Electronic ambient
      const frequencies = [110, 220, 330];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        
        // Add LFO for movement
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(0.5 + i * 0.2, ctx.currentTime);
        lfoGain.gain.setValueAtTime(3, ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        osc.connect(gain);
        gain.connect(musicGainRef.current);
        oscillators.push(osc, lfo);
        gains.push(gain, lfoGain);
      });
    }

    return { oscillators, gains };
  }, []);

  // Play background music
  const playMusic = useCallback((trackId) => {
    if (!userInteracted) return;
    
    const ctx = initAudioContext();
    if (!ctx) return;

    // Stop current music
    if (currentMusicRef.current) {
      currentMusicRef.current.oscillators.forEach(osc => {
        try { osc.stop(); } catch {}
      });
      currentMusicRef.current = null;
    }

    if (trackId === 'none' || !MUSIC_TRACKS[trackId]) {
      setSettings(s => ({ ...s, currentTrack: 'none' }));
      return;
    }

    const music = generateAmbientMusic(trackId);
    if (music) {
      music.oscillators.forEach(osc => osc.start());
      currentMusicRef.current = music;
      setSettings(s => ({ ...s, currentTrack: trackId }));
    }
  }, [userInteracted, initAudioContext, generateAmbientMusic]);

  // Stop music
  const stopMusic = useCallback(() => {
    if (currentMusicRef.current) {
      currentMusicRef.current.oscillators.forEach(osc => {
        try { osc.stop(); } catch {}
      });
      currentMusicRef.current = null;
    }
    setSettings(s => ({ ...s, currentTrack: 'none' }));
  }, []);

  // Play hover sound (short click/tick)
  const playHoverSound = useCallback(() => {
    if (!settings.masterEnabled || !settings.hoverSoundsEnabled || !userInteracted) return;
    
    const ctx = initAudioContext();
    if (!ctx || !effectsGainRef.current) return;

    // Create a short click sound
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

  // Play effect sound (win, spin, etc.)
  const playEffect = useCallback((effectType) => {
    if (!settings.masterEnabled || !userInteracted) return;
    
    const ctx = initAudioContext();
    if (!ctx || !effectsGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    switch (effectType) {
      case 'win':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(effectsGainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        break;

      case 'spin':
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(effectsGainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;

      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(effectsGainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
        break;

      case 'purchase':
        // Coin sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(effectsGainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;

      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(effectsGainRef.current);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;

      case 'levelup':
        // Fanfare
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
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
        return; // Early return since we handled it differently

      default:
        return;
    }
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
      if (currentMusicRef.current) {
        currentMusicRef.current.oscillators.forEach(osc => {
          try { osc.stop(); } catch {}
        });
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const value = {
    // State
    settings,
    userInteracted,
    musicTracks: MUSIC_TRACKS,
    
    // Actions
    playHoverSound,
    playEffect,
    playMusic,
    stopMusic,
    
    // Settings setters
    setMasterEnabled,
    setMasterVolume,
    setMusicVolume,
    setEffectsVolume,
    setHoverSoundsEnabled,
    selectTrack,
    
    // Trigger user interaction
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
