import { SessionLog } from '../../sim/index.js';

const PENDING_FORK_KEY = 'vajra:pending-fork';

export interface PendingForkLaunch {
  parentId: string;
  parentLabel: string;
  traineeId: string;
  unitId: string;
  tick: number;
  sessionLog: SessionLog;
}

export function writePendingFork(launch: PendingForkLaunch): void {
  window.sessionStorage.setItem(PENDING_FORK_KEY, JSON.stringify(launch));
}

export function takePendingFork(): PendingForkLaunch | null {
  const raw = window.sessionStorage.getItem(PENDING_FORK_KEY);
  window.sessionStorage.removeItem(PENDING_FORK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingForkLaunch>;
    if (typeof parsed.parentId !== 'string' || typeof parsed.tick !== 'number' || !parsed.sessionLog) return null;
    return {
      parentId: parsed.parentId,
      parentLabel: parsed.parentLabel ?? parsed.parentId,
      traineeId: typeof parsed.traineeId === 'string' ? parsed.traineeId : '',
      unitId: typeof parsed.unitId === 'string' ? parsed.unitId : '',
      tick: parsed.tick,
      sessionLog: parsed.sessionLog,
    };
  } catch {
    return null;
  }
}
