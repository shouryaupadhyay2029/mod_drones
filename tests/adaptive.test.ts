import { describe, expect, it } from 'vitest';
import {
  AdaptiveSession,
  deriveSkillStates,
  recommendNext,
  SkillStates,
} from '../src/sim/training/adaptive.js';

function session(id: string, startedAt: number, discipline: number): AdaptiveSession {
  return {
    id,
    startedAt,
    report: {
      perContact: [],
      subscores: { discipline },
    } as unknown as AdaptiveSession['report'],
    summary: { total: 50, assetHit: false, hostilesTotal: 1, hostilesNeutralised: 1 },
    tier: 'operator',
  };
}

describe('adaptive training recommendations', () => {
  it('starts a new trainee at recruit', () => {
    expect(recommendNext({}, [])).toMatchObject({ tier: 'recruit', focus: 'none' });
  });

  it('promotes only after three strong sessions and two safe sessions', () => {
    const history = [80, 90, 85].map((total) => ({ total, assetHit: false, tier: 'operator' }));
    expect(recommendNext({}, history).tier).toBe('veteran');
    expect(recommendNext({}, history.map((item, i) => ({ ...item, assetHit: i === 2 }))).tier).toBe('operator');
  });

  it('demotes after two low scores and chooses a confident weak-skill focus', () => {
    const skillStates: SkillStates = {
      classification_decoy_drone: { value: 35, n: 2, confidence: 0.4 },
    };
    const history = [30, 39].map((total) => ({ total, assetHit: false, tier: 'veteran' }));
    const result = recommendNext(skillStates, history);
    expect(result).toMatchObject({ tier: 'operator', focus: 'decoys' });
    expect(result.rationale.join(' ')).toContain('n=2');
  });

  it('updates observed skills with a deterministic EWMA', () => {
    const states = deriveSkillStates([session('second', 2, 80), session('first', 1, 40)]);
    expect(states.fire_discipline).toMatchObject({ value: 52, n: 2, confidence: 0.4 });
  });
});
