import { ScoreReportV2 } from '../scoring/doctrine.js';
import { Tier } from '../scenarios/generator.js';

export const ADAPTIVE_SKILLS = [
  'detection_latency',
  'classification_bird',
  'classification_commercial_quad',
  'classification_fpv_kamikaze',
  'classification_fpv_fiber',
  'classification_decoy_drone',
  'engagement_latency',
  'effector_fit',
  'fire_discipline',
  'asset_defence',
] as const;

export type AdaptiveSkill = (typeof ADAPTIVE_SKILLS)[number];

export interface SkillEstimate {
  value: number;
  n: number;
  confidence: number;
}

export type SkillStates = Partial<Record<AdaptiveSkill, SkillEstimate>>;

export interface AdaptiveSession {
  id: string;
  startedAt: number;
  report: ScoreReportV2;
  summary: {
    total: number;
    assetHit: boolean;
    hostilesTotal: number;
    hostilesNeutralised: number;
  };
  tier: string;
  fingerprint?: string;
}

export interface AdaptiveHistoryItem {
  total: number;
  assetHit: boolean;
  tier: string;
  fingerprint?: string;
}

export type TrainingFocus = 'decoys' | 'fiber' | 'traffic' | 'saturation' | 'none';

export interface AdaptiveRecommendation {
  tier: Tier;
  focus: TrainingFocus;
  rationale: string[];
}

function average(values: number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sessionSamples(session: AdaptiveSession): Partial<Record<AdaptiveSkill, number>> {
  const contacts = session.report.perContact;
  const hostileCount = session.summary.hostilesTotal;
  const samples: Partial<Record<AdaptiveSkill, number>> = {};
  const detection = average(contacts.map((contact) => contact.d * 100));
  const engagement = average(contacts.map((contact) => (contact.latency ?? 0) * 100));
  const fit = average(contacts.map((contact) => (contact.fit ?? 0) * 100));
  if (detection !== undefined) samples.detection_latency = detection;
  if (engagement !== undefined) samples.engagement_latency = engagement;
  if (fit !== undefined) samples.effector_fit = fit;
  samples.fire_discipline = session.report.subscores.discipline;
  if (hostileCount > 0) {
    samples.asset_defence = session.summary.assetHit
      ? 0
      : (session.summary.hostilesNeutralised / hostileCount) * 100;
  }

  for (const skill of ADAPTIVE_SKILLS) {
    if (!skill.startsWith('classification_')) continue;
    const classId = skill.slice('classification_'.length);
    const values = contacts
      .filter((contact) => contact.classId === classId)
      .map((contact) => contact.c * 100);
    const value = average(values);
    if (value !== undefined) samples[skill] = value;
  }
  return samples;
}

export function deriveSkillStates(
  sessions: readonly AdaptiveSession[],
  alpha = 0.3
): SkillStates {
  const weight = Math.max(0, Math.min(1, alpha));
  const estimates: SkillStates = {};
  const orderedSessions = [...sessions].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));

  for (const session of orderedSessions) {
    const samples = sessionSamples(session);
    for (const skill of ADAPTIVE_SKILLS) {
      const sample = samples[skill];
      if (sample === undefined) continue;
      const previous = estimates[skill];
      const n = (previous?.n ?? 0) + 1;
      estimates[skill] = {
        value: previous ? weight * sample + (1 - weight) * previous.value : sample,
        n,
        confidence: Math.min(1, n / 5),
      };
    }
  }
  return estimates;
}

const TIERS: readonly Tier[] = ['recruit', 'operator', 'veteran', 'elite'];

function adjacentTier(tier: string, direction: -1 | 1): Tier {
  const index = TIERS.indexOf(tier as Tier);
  const current = index < 0 ? 0 : index;
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, current + direction))]!;
}

function chooseFocus(skillStates: SkillStates): { focus: TrainingFocus; rationale: string } {
  const candidates = Object.entries(skillStates)
    .filter((entry): entry is [AdaptiveSkill, SkillEstimate] =>
      entry[1] !== undefined && entry[1].value < 60 && entry[1].confidence >= 0.4
    )
    .sort((a, b) => a[1].value - b[1].value || a[0].localeCompare(b[0]));
  const weakest = candidates[0];
  if (!weakest) return { focus: 'none', rationale: 'No skill is below 60 with at least 0.40 confidence; no added focus is recommended.' };

  const [skill, estimate] = weakest;
  const focus: TrainingFocus = skill === 'classification_decoy_drone'
    ? 'decoys'
    : skill === 'classification_fpv_fiber' || skill === 'effector_fit'
      ? 'fiber'
      : skill === 'fire_discipline'
        ? 'traffic'
        : skill === 'engagement_latency'
          ? 'saturation'
          : 'none';
  return {
    focus,
    rationale: `Weakest eligible skill is ${skill.replaceAll('_', ' ')} at ${estimate.value.toFixed(1)}/100 (n=${estimate.n}, confidence=${estimate.confidence.toFixed(2)}); focus ${focus}.`,
  };
}

export function recommendNext(
  skillStates: SkillStates,
  history: readonly AdaptiveHistoryItem[]
): AdaptiveRecommendation {
  const rationale: string[] = [];
  let tier: Tier;

  if (history.length === 0) {
    tier = 'recruit';
    rationale.push('First recorded session: start at recruit (history n=0).');
  } else {
    const currentTier = history[history.length - 1]?.tier ?? 'recruit';
    const lastThree = history.slice(-3);
    const lastTwo = history.slice(-2);
    const promote = lastThree.length === 3 && lastThree.every((session) => session.total >= 80) &&
      lastTwo.length === 2 && lastTwo.every((session) => !session.assetHit);
    const demote = lastTwo.length === 2 && lastTwo.every((session) => session.total < 40);

    if (promote) {
      tier = adjacentTier(currentTier, 1);
      rationale.push(`Promote from ${currentTier}: last 3 totals [${lastThree.map((s) => s.total).join(', ')}] are all >= 80 and last 2 asset-hit flags are [${lastTwo.map((s) => String(s.assetHit)).join(', ')}].`);
    } else if (demote) {
      tier = adjacentTier(currentTier, -1);
      rationale.push(`Demote from ${currentTier}: last 2 totals [${lastTwo.map((s) => s.total).join(', ')}] are both < 40.`);
    } else {
      tier = currentTier as Tier;
      rationale.push(`Stay at ${tier}: promotion requires 3 totals >= 80 plus no asset hit in the last 2; demotion requires 2 totals < 40.`);
    }
  }

  const focusChoice = chooseFocus(skillStates);
  rationale.push(focusChoice.rationale);
  return { tier, focus: focusChoice.focus, rationale };
}
