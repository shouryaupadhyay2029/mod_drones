/**
 * Pure synthetic Web Audio API sound engine for VAJRA.
 * Uses zero external audio files — 100% procedural oscillator synthesis.
 * Starts muted by default to respect browser autoplay policies.
 */

import { SimEvent } from '../../sim/index.js';

type MuteListener = (muted: boolean) => void;

interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: AudioNode;
  resume: () => Promise<void>;
  createOscillator: () => OscillatorNode;
  createGain: () => GainNode;
}

let isMutedState = true;
let sharedAudioContext: AudioContextLike | null = null;
const muteListeners = new Set<MuteListener>();

function getAudioContextConstructor(): (new () => AudioContextLike) | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function getOrCreateAudioContext(): AudioContextLike | null {
  if (sharedAudioContext) {
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  }
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  try {
    sharedAudioContext = new Ctor();
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export function isAudioMuted(): boolean {
  return isMutedState;
}

export function setAudioMuted(muted: boolean): void {
  isMutedState = muted;
  if (!isMutedState) {
    getOrCreateAudioContext();
  }
  for (const listener of muteListeners) {
    listener(isMutedState);
  }
}

export function toggleAudioMuted(): boolean {
  setAudioMuted(!isMutedState);
  return isMutedState;
}

export function subscribeAudioMuted(listener: MuteListener): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

/**
 * Short high-pitch sine wave (800 Hz, 50 ms) for new tentative/confirmed radar tracks.
 */
export function playRadarBlip(): void {
  if (isMutedState) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const durationSec = 0.05; // 50 ms

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec);
  } catch {
    // Ignore audio context state errors in non-interactive environments
  }
}

/**
 * Aggressive alternating square wave pulse (400 Hz / 520 Hz, 200 ms)
 * for inbound hostile/FPV tracks crossing < 1500 m.
 */
export function playWarning(): void {
  if (isMutedState) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const durationSec = 0.2; // 200 ms

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.setValueAtTime(520, now + 0.05);
    osc.frequency.setValueAtTime(400, now + 0.1);
    osc.frequency.setValueAtTime(520, now + 0.15);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec);
  } catch {
    // Ignore audio context state errors in non-interactive environments
  }
}

/**
 * Processes newly arrived simulation events from `useMission` and triggers
 * `playRadarBlip()` on `TRACK_CONFIRMED` and `playWarning()` on `TRACK_IN_RANGE`.
 */
export function processMissionAudioEvents(
  events: readonly SimEvent[],
  previousCount: number,
): number {
  const startIdx = Math.max(0, Math.min(previousCount, events.length));
  for (let i = startIdx; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.type === 'TRACK_CONFIRMED') {
      playRadarBlip();
    } else if (ev.type === 'TRACK_IN_RANGE') {
      playWarning();
    }
  }
  return events.length;
}
