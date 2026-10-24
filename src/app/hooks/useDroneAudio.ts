/**
 * useDroneAudio — Web Audio API quadrotor drone synthesizer.
 *
 * Generates a convincing multi-rotor drone hum using:
 *  • 4 oscillators (one per rotor arm) at slightly detuned frequencies
 *  • A low-frequency "blade chop" amplitude modulator
 *  • A light bandpass resonance to add the characteristic whine
 *  • A gain node for master volume / mute
 *
 * No audio files required — fully synthesised in the browser.
 * Starts muted (user must click unmute) to respect browser autoplay policy.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// Base rotor RPM ≈ 8000 RPM → 8000/60 = ~133 Hz fundamental.
// Four rotors with slight frequency spread for realistic beating effect.
const BASE_FREQ = 133; // Hz
const ROTOR_DETUNE = [0, 4, -3, 7]; // Hz offset per rotor
const MASTER_VOLUME = 0.22; // mid-level: not too loud

export function useDroneAudio() {
  const [isMuted, setIsMuted] = useState(true); // start muted — browser policy
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);

  // Boot the audio graph once (lazy — first unmute)
  const bootAudio = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    // Master gain (controls mute/unmute)
    const master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
    master.connect(ctx.destination);
    masterGainRef.current = master;

    // Highpass filter — cuts sub-bass rumble below 80 Hz
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;
    hp.connect(master);

    // Bandpass resonance — the characteristic whine around 600 Hz
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 1.8;
    bp.connect(hp);

    // Lowpass to soften harsh harmonics above ~4 kHz
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    lp.connect(bp);

    // Blade-chop amplitude modulator (LFO at rotor frequency)
    const chopLfo = ctx.createOscillator();
    chopLfo.type = 'sine';
    chopLfo.frequency.value = BASE_FREQ * 0.5; // once per blade revolution
    const chopGain = ctx.createGain();
    chopGain.gain.value = 0.18; // modulation depth
    chopLfo.connect(chopGain);

    // Carrier oscillator bank — 4 rotors
    ROTOR_DETUNE.forEach((detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; // rich in harmonics like real rotors
      osc.frequency.value = BASE_FREQ + detune;

      const rotorGain = ctx.createGain();
      rotorGain.gain.value = 0.25; // per-rotor volume share

      // Connect chop LFO → rotorGain modulation input
      chopGain.connect(rotorGain.gain);

      osc.connect(rotorGain);
      rotorGain.connect(lp);
      osc.start();
    });

    // Add a sub-harmonic body thump (low sawtooth)
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = BASE_FREQ * 0.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.12;
    sub.connect(subGain);
    subGain.connect(hp);
    sub.start();

    chopLfo.start();
  }, []);

  // Toggle mute / unmute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        // Mute — fade out to avoid click
        if (masterGainRef.current && ctxRef.current) {
          masterGainRef.current.gain.setTargetAtTime(
            0,
            ctxRef.current.currentTime,
            0.08
          );
        }
      } else {
        // Unmute — boot if first time, fade in
        bootAudio();
        if (masterGainRef.current && ctxRef.current) {
          masterGainRef.current.gain.setTargetAtTime(
            MASTER_VOLUME,
            ctxRef.current.currentTime,
            0.15
          );
        }
      }
      return next;
    });
  }, [bootAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { isMuted, toggleMute };
}
