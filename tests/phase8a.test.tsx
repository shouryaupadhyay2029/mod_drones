import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  isAudioMuted,
  setAudioMuted,
  toggleAudioMuted,
  playRadarBlip,
  playWarning,
  processMissionAudioEvents,
} from '../src/app/audio/synth.js';

interface RecordedOscillator {
  type: string;
  frequencies: Array<{ value: number; time: number }>;
  startedAt: number | null;
  stoppedAt: number | null;
}

function installMockAudioContext(): { oscillators: RecordedOscillator[] } {
  const oscillators: RecordedOscillator[] = [];

  class MockAudioContext {
    public currentTime = 10;
    public state = 'running';
    public destination = {} as AudioNode;

    public async resume(): Promise<void> {
      this.state = 'running';
    }

    public createOscillator(): OscillatorNode {
      const record: RecordedOscillator = {
        type: 'sine',
        frequencies: [],
        startedAt: null,
        stoppedAt: null,
      };
      oscillators.push(record);
      return {
        get type() {
          return record.type as OscillatorType;
        },
        set type(val: OscillatorType) {
          record.type = val;
        },
        frequency: {
          setValueAtTime(value: number, time: number) {
            record.frequencies.push({ value, time });
          },
        },
        connect() {
          return undefined;
        },
        start(when = 0) {
          record.startedAt = when;
        },
        stop(when = 0) {
          record.stoppedAt = when;
        },
      } as unknown as OscillatorNode;
    }

    public createGain(): GainNode {
      return {
        gain: {
          setValueAtTime() {
            return undefined;
          },
          exponentialRampToValueAtTime() {
            return undefined;
          },
        },
        connect() {
          return undefined;
        },
      } as unknown as GainNode;
    }
  }

  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  return { oscillators };
}

describe('Phase 8A: Synthetic Audio Engine & PWA Manifest', () => {
  beforeEach(() => {
    setAudioMuted(true);
  });

  it('defaults to muted and toggles mute state cleanly', () => {
    expect(isAudioMuted()).toBe(true);
    expect(toggleAudioMuted()).toBe(false);
    expect(isAudioMuted()).toBe(false);
    expect(toggleAudioMuted()).toBe(true);
    expect(isAudioMuted()).toBe(true);
  });

  it('synthesizes 800Hz 50ms sine radar blips and 400Hz 200ms alternating square warnings on mission events', () => {
    const { oscillators } = installMockAudioContext();

    // While muted, no oscillators are triggered
    playRadarBlip();
    playWarning();
    expect(oscillators).toHaveLength(0);

    // Unmute and trigger via processMissionAudioEvents
    setAudioMuted(false);
    const nextIdx = processMissionAudioEvents(
      [
        { tick: 10, type: 'TRACK_CONFIRMED', payload: { trackId: 1 } },
        { tick: 25, type: 'TRACK_IN_RANGE', payload: { trackId: 1, effector: 'jammer', rangeM: 1490 } },
      ],
      0,
    );
    expect(nextIdx).toBe(2);
    expect(oscillators).toHaveLength(2);

    // First sound: playRadarBlip() -> 800Hz sine wave, 50ms
    const blip = oscillators[0]!;
    expect(blip.type).toBe('sine');
    expect(blip.frequencies[0]?.value).toBe(800);
    expect((blip.stoppedAt ?? 0) - (blip.startedAt ?? 0)).toBeCloseTo(0.05, 5);

    // Second sound: playWarning() -> alternating 400Hz/520Hz square wave, 200ms
    const warning = oscillators[1]!;
    expect(warning.type).toBe('square');
    expect(warning.frequencies.map((f) => f.value)).toEqual([400, 520, 400, 520]);
    expect((warning.stoppedAt ?? 0) - (warning.startedAt ?? 0)).toBeCloseTo(0.2, 5);
  });

  it('defines a standard PWA manifest.json with VAJRA cream theme colors', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      short_name: string;
      theme_color: string;
      background_color: string;
      display: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.short_name).toBe('VAJRA');
    expect(manifest.theme_color).toBe('#ded7ca');
    expect(manifest.background_color).toBe('#ded7ca');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
