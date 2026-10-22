import { Vec3 } from '../core/vec.js';
import { ThreatClassId } from './threats.js';

export type TrackState = 'tentative' | 'confirmed' | 'dropped';
export type RcsBucket = 'tiny' | 'small' | 'medium';
export type EngagementStatus = 'none' | 'engaged' | 'holding_fire';

export interface Track {
  trackId: number;
  actorId: number; // Internal ground truth link (NEVER exposed to trainee view)
  state: TrackState;
  estimatedPos: Vec3;
  estimatedVel: Vec3;
  lastDetectedTick: number;
  firstSeenTick: number;
  confirmedTick?: number;
  lostTick?: number;
  consecutiveHits: number;
  consecutiveMisses: number;
  totalPlots: number;
  isGhost?: boolean;
  remainingSweeps?: number;
  ghostRemainingRotations?: number;
  ghostWillConfirm?: boolean;
  ghostRotationsSeen?: number;
  rcsBucket: RcsBucket;
  measuredRcs: number;
  quality: number;
  acked: boolean;
  ackTick?: number;
  assessedClass?: ThreatClassId | 'unknown';
  classifyTick?: number;
  engagementStatus: EngagementStatus;
  headingChangeRateSmoothed: number;
  previousHeadingDeg?: number;
  lastSweepChecked: number;
}
