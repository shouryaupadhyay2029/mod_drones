/**
 * useDroneAudio — High-Fidelity Web Audio API Quadrotor Drone Synthesizer.
 *
 * Replaces basic sawtooth buzzer with an authentic physical acoustic model
 * of a modern tactical quadrotor / FPV drone:
 *  1. 4 Detuned Rotor Arms with independent spatial stereo panning
 *  2. Blade Pass Frequency (BPF) harmonics (1st, 2nd, 3rd propeller acoustic modes)
 *  3. Aerodynamic Downwash Turbulence (pink/white noise air-tearing buffer)
 *  4. Periodic Blade Chop amplitude modulation (rotor blade air-slicing pulses)
 *  5. Electronic Speed Controller (ESC) high-frequency brushless stator whine
 *  6. Dual-rate PID Flight Controller Gyro Flutter (organic hover breathing)
 *  7. Air-absorption acoustic filtering and soft-knee acoustic presence EQ
 *
 * Zero external audio files required — 100% offline, zero-latency, seamless infinite loop.
 * Starts muted by default to comply with browser autoplay policies.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// Hover motor RPM ≈ 6,600 RPM → fundamental motor shaft rotation f0 ≈ 110 Hz
const BASE_MOTOR_HZ = 110;

// Individual rotor motor detuning (Hz offset per arm for authentic acoustic phase beating)
const ROTOR_OFFSETS = [-2.8, 1.9, -1.2, 3.6];

// Quadrotor arm stereo panning (FL, FR, RL, RR)
const ROTOR_PANS = [-0.35, 0.35, -0.2, 0.2];

// Comfortable atmospheric mid-volume
const MASTER_VOLUME = 0.20;

export function useDroneAudio() {
  const [isMuted, setIsMuted] = useState(true);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const startedRef = useRef(false);

  const bootAudio = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    ctxRef.current = ctx;

    // Master Output & Mute Gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // --- MASTER ACOUSTIC SHAPING CHAIN ---
    // 1. High-pass filter: removes subwoofer mud below 70 Hz
    const masterHp = ctx.createBiquadFilter();
    masterHp.type = 'highpass';
    masterHp.frequency.value = 75;

    // 2. Propeller Presence Peak: emphasizes the characteristic 450 Hz drone prop resonance
    const presencePeak = ctx.createBiquadFilter();
    presencePeak.type = 'peaking';
    presencePeak.frequency.value = 460;
    presencePeak.Q.value = 2.0;
    presencePeak.gain.value = 3.5;

    // 3. Air Dissipation High-Shelf: rolls off harsh high frequencies above 3.5 kHz like real open air
    const airAbsorption = ctx.createBiquadFilter();
    airAbsorption.type = 'lowpass';
    airAbsorption.frequency.value = 3600;

    masterHp.connect(presencePeak);
    presencePeak.connect(airAbsorption);
    airAbsorption.connect(masterGain);

    // --- ORGANIC FLIGHT CONTROLLER PID DRIFT (DUAL LFOS) ---
    // Slow atmospheric hover wander (~0.45 Hz)
    const driftLfo = ctx.createOscillator();
    driftLfo.type = 'sine';
    driftLfo.frequency.value = 0.45;
    const driftGain = ctx.createGain();
    driftGain.gain.value = 1.8; // +/- 1.8 Hz drift
    driftLfo.connect(driftGain);
    driftLfo.start();

    // Fast gyro stabilization hunting (~2.6 Hz micro-flutter)
    const gyroLfo = ctx.createOscillator();
    gyroLfo.type = 'sine';
    gyroLfo.frequency.value = 2.6;
    const gyroGain = ctx.createGain();
    gyroGain.gain.value = 1.2; // +/- 1.2 Hz micro-flutter
    gyroLfo.connect(gyroGain);
    gyroLfo.start();

    // --- AERODYNAMIC DOWNWASH & ROTOR CHOP TURBULENCE (AIR TEARING) ---
    // Create 2 seconds of pink/white Gaussian noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    let lastNoise = 0;
    for (let i = 0; i < bufferSize; i++) {
      // 1-pole pink noise filter for realistic air resistance acoustics
      const white = Math.random() * 2 - 1;
      lastNoise = lastNoise * 0.92 + white * 0.08;
      noiseData[i] = lastNoise * 2.8;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Bandpass filter isolating the turbulent prop wash band (350-550 Hz)
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 1.6;

    // Blade chop amplitude modulator: rhythmic air-slicing pulses at blade-pass rate
    const bladeChopLfo = ctx.createOscillator();
    bladeChopLfo.type = 'sine';
    bladeChopLfo.frequency.value = 22; // ~22 blade sweeps per second
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.22;
    bladeChopLfo.connect(chopDepth);
    bladeChopLfo.start();

    const noiseAmp = ctx.createGain();
    noiseAmp.gain.value = 0.28;
    chopDepth.connect(noiseAmp.gain);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseAmp);
    noiseAmp.connect(masterHp);
    noiseSource.start();

    // --- 4 ASYNCHRONOUS ROTOR ARMS ---
    ROTOR_OFFSETS.forEach((offset, idx) => {
      const rotorBaseFreq = BASE_MOTOR_HZ + offset;
      const bpf1 = rotorBaseFreq * 2; // Primary blade pass frequency (~220 Hz)
      const bpf2 = rotorBaseFreq * 4; // Secondary harmonic (~440 Hz)
      const panVal = ROTOR_PANS[idx] ?? 0;

      // Stereo panner for spatial physical immersion
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) panner.pan.value = panVal;

      const rotorBus = ctx.createGain();
      rotorBus.gain.value = 0.22;

      // 1. Motor Shaft Rotation (Low body thump)
      const motorOsc = ctx.createOscillator();
      motorOsc.type = 'triangle';
      motorOsc.frequency.value = rotorBaseFreq;
      driftGain.connect(motorOsc.frequency);
      gyroGain.connect(motorOsc.frequency);

      const motorGain = ctx.createGain();
      motorGain.gain.value = 0.28;
      motorOsc.connect(motorGain);
      motorGain.connect(rotorBus);
      motorOsc.start();

      // 2. Primary Blade Pass Frequency (The distinct buzzing whine)
      const bpfOsc = ctx.createOscillator();
      bpfOsc.type = 'sawtooth';
      bpfOsc.frequency.value = bpf1;
      driftGain.connect(bpfOsc.frequency);
      gyroGain.connect(bpfOsc.frequency);

      // Lowpass filter per rotor to smooth digital edge into mechanical acoustic buzz
      const bpfFilter = ctx.createBiquadFilter();
      bpfFilter.type = 'lowpass';
      bpfFilter.frequency.value = 950;

      const bpfGain = ctx.createGain();
      bpfGain.gain.value = 0.35;

      bpfOsc.connect(bpfFilter);
      bpfFilter.connect(bpfGain);
      bpfGain.connect(rotorBus);
      bpfOsc.start();

      // 3. Secondary Propeller Harmonic (Crisp air-tearing buzz)
      const bpf2Osc = ctx.createOscillator();
      bpf2Osc.type = 'sawtooth';
      bpf2Osc.frequency.value = bpf2;
      driftGain.connect(bpf2Osc.frequency);

      const bpf2Filter = ctx.createBiquadFilter();
      bpf2Filter.type = 'bandpass';
      bpf2Filter.frequency.value = bpf2;
      bpf2Filter.Q.value = 2.4;

      const bpf2Gain = ctx.createGain();
      bpf2Gain.gain.value = 0.18;

      bpf2Osc.connect(bpf2Filter);
      bpf2Filter.connect(bpf2Gain);
      bpf2Gain.connect(rotorBus);
      bpf2Osc.start();

      if (panner) {
        rotorBus.connect(panner);
        panner.connect(masterHp);
      } else {
        rotorBus.connect(masterHp);
      }
    });

    // --- BRUSHLESS ESC INVERTER / STATOR SINGING (HIGH-FREQUENCY WHINE) ---
    // Electronic Speed Controllers produce an unmistakable high-frequency singing whine
    const escOsc = ctx.createOscillator();
    escOsc.type = 'sine';
    escOsc.frequency.value = 2840; // 2.84 kHz stator vibration
    const escGain = ctx.createGain();
    escGain.gain.value = 0.028; // subtle presence layer

    const escFilter = ctx.createBiquadFilter();
    escFilter.type = 'bandpass';
    escFilter.frequency.value = 2840;
    escFilter.Q.value = 4.0;

    escOsc.connect(escFilter);
    escFilter.connect(escGain);
    escGain.connect(masterHp);
    escOsc.start();
  }, []);

  // Toggle mute / unmute with click-free audio ramping
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        // Mute — smoothly fade out over 80ms to avoid audio pops
        if (masterGainRef.current && ctxRef.current) {
          masterGainRef.current.gain.setTargetAtTime(
            0,
            ctxRef.current.currentTime,
            0.08
          );
        }
      } else {
        // Unmute — boot synthesizer if first time, then smoothly fade in over 120ms
        bootAudio();
        if (ctxRef.current && ctxRef.current.state === 'suspended') {
          ctxRef.current.resume().catch(() => {});
        }
        if (masterGainRef.current && ctxRef.current) {
          masterGainRef.current.gain.setTargetAtTime(
            MASTER_VOLUME,
            ctxRef.current.currentTime,
            0.12
          );
        }
      }
      return next;
    });
  }, [bootAudio]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { isMuted, toggleMute };
}
