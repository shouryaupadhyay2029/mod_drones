import { MissionSummary, ScoreReportV2, SessionLog } from '../../sim/index.js';
import { createLocalId, ensureGuestProfile, saveSession } from './db.js';

export interface CompletedMissionReport {
  scoreV2: ScoreReportV2;
  sessionLog: SessionLog;
  hash: string;
  scoreVersion: string;
  summary: MissionSummary;
}

export async function persistMissionReport(
  report: CompletedMissionReport,
  startedAt: number
): Promise<void> {
  const { traineeId, unitId } = await ensureGuestProfile();
  const scenarioKey = report.sessionLog.scenarioId ?? 'dawn_intrusion';
  await saveSession({
    id: createLocalId(),
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
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vajra:data-changed'));
}
