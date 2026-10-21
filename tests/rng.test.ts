import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/core/rng.js';

describe('RNG Core & Determinism', () => {
  // Acceptance Test 1
  it('1. RNG: same seed gives identical 1000-value sequence; different seeds differ', () => {
    const seed = 'tactical-seed-42';
    const rng1 = new Rng(seed);
    const rng2 = new Rng(seed);
    const rngDiff = new Rng('different-seed-99');

    const seq1: number[] = [];
    const seq2: number[] = [];
    const seqDiff: number[] = [];

    for (let i = 0; i < 1000; i++) {
      seq1.push(rng1.next());
      seq2.push(rng2.next());
      seqDiff.push(rngDiff.next());
    }

    expect(seq1).toEqual(seq2);
    expect(seq1).not.toEqual(seqDiff);
  });

  // Acceptance Test 2
  it('2. RNG fork: fork("a") and fork("b") differ; forking does not change the parent stream', () => {
    const seed = 'parent-seed-xyz';

    // Baseline: parent stream without forking
    const baselineParent = new Rng(seed);
    for (let i = 0; i < 20; i++) baselineParent.next();
    const baselineNext100: number[] = [];
    for (let i = 0; i < 100; i++) {
      baselineNext100.push(baselineParent.next());
    }

    // Test parent: fork midway
    const parent = new Rng(seed);
    for (let i = 0; i < 20; i++) parent.next();

    const forkA = parent.fork('a');
    const forkB = parent.fork('b');

    // Forking must NOT consume or disturb parent's sequence
    const parentNext100: number[] = [];
    for (let i = 0; i < 100; i++) {
      parentNext100.push(parent.next());
    }
    expect(parentNext100).toEqual(baselineNext100);

    // fork("a") and fork("b") must produce different streams
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 50; i++) {
      seqA.push(forkA.next());
      seqB.push(forkB.next());
    }
    expect(seqA).not.toEqual(seqB);
  });

  it('RNG helpers: int, pick, chance, and state serialization behave deterministically', () => {
    const rng = new Rng('helpers-seed');
    const stateBefore = rng.getState();

    const intVal = rng.int(10, 20);
    expect(intVal).toBeGreaterThanOrEqual(10);
    expect(intVal).toBeLessThanOrEqual(20);

    const items = ['alpha', 'bravo', 'charlie', 'delta'] as const;
    const picked = rng.pick(items);
    expect(items).toContain(picked);

    const boolVal = rng.chance(0.5);
    expect(typeof boolVal).toBe('boolean');

    // Restore state
    rng.setState(stateBefore);
    expect(rng.getState()).toBe(stateBefore);
    expect(rng.int(10, 20)).toBe(intVal);
  });
});
