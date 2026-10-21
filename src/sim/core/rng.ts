export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function toUint32(seed: string | number): number {
  if (typeof seed === 'string') {
    return xmur3(seed);
  }
  return xmur3(seed.toString());
}

export class Rng {
  private state: number;
  private readonly initialSeed: string | number;

  constructor(seed: string | number) {
    this.initialSeed = seed;
    this.state = toUint32(seed);
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public int(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const range = hi - lo + 1;
    return lo + Math.floor(this.next() * range);
  }

  public pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Rng.pick: array must not be empty');
    }
    const idx = Math.floor(this.next() * array.length);
    const chosen = array[idx];
    if (chosen === undefined) {
      throw new Error('Rng.pick: index out of bounds');
    }
    return chosen;
  }

  public chance(p: number): boolean {
    return this.next() < p;
  }

  public fork(label: string): Rng {
    const forkKey = `${this.state}:${label}`;
    return new Rng(forkKey);
  }

  public getState(): number {
    return this.state >>> 0;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }

  public getSeed(): string | number {
    return this.initialSeed;
  }
}
