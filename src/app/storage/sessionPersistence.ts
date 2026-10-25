import { MissionSummary, ScoreReportV2, SessionLog } from '../../sim/index.js';
import { createLocalId, ensureGuestProfile, saveSession } from './db.js';

export interface CompletedMissionReport {
  scoreV2: ScoreReportV2;
  sessionLog: SessionLog;
  hash: string;
  scoreVersion: string;
  summary: MissionSummary;
  fingerprint?: string;
}

export interface SessionOwner {
  traineeId?: string;
  unitId?: string;
}

export interface ForkSessionMetadata {
  parentId: string;
  forkTick: number;
}

export async function persistMissionReport(
  report: CompletedMissionReport,
  startedAt: number,
  owner?: SessionOwner,
  fork?: ForkSessionMetadata
): Promise<string> {
  const guest = owner?.traineeId && owner.unitId ? undefined : await ensureGuestProfile();
  const traineeId = owner?.traineeId ?? guest!.traineeId;
  const unitId = owner?.unitId ?? guest!.unitId;
  const scenarioKey = report.sessionLog.scenarioId ?? 'dawn_intrusion';
  const id = createLocalId();
  await saveSession({
    id,
    traineeId,
    unitId,
    startedAt: startedAt || Date.now(),
    scenarioKey,
    tier: scenarioKey.split(':')[2] ?? 'scripted',
    focus: scenarioKey.split(':')[3] ?? 'none',
    seed: report.sessionLog.seed,
    sessionLog: report.sessionLog,
    scoreVersion: report.scoreVersion,
    report: report.scoreV2,
    summary: report.summary,
    hash: report.hash,
    fingerprint: report.fingerprint,
    parentId: fork?.parentId,
    forkTick: fork?.forkTick,
    isFork: Boolean(fork),
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vajra:data-changed'));
  return id;
}
