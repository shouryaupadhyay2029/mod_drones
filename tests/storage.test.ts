import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Engine, rescoreSession, SCORE_VERSION } from '../src/sim/index.js';
import { persistMissionReport } from '../src/app/storage/sessionPersistence.js';
import {
  deleteAllData,
  exportData,
  importData,
  listSessions,
  listTrainees,
  listUnits,
  saveSession,
  saveSetting,
  saveTrainee,
  saveUnit,
} from '../src/app/storage/db.js';

describe('VAJRA local session storage', () => {
  beforeEach(async () => {
    await deleteAllData();
  });

  it('creates the version 2 stores and supports typed record CRUD', async () => {
    const unit = { id: 'unit-1', name: 'North Cell', createdAt: 10 };
    const trainee = { id: 'trainee-1', callsign: 'Echo', unitId: unit.id, createdAt: 11 };
    await saveUnit(unit);
    await saveTrainee(trainee);

    expect(await listUnits()).toEqual([unit]);
    expect(await listTrainees()).toEqual([trainee]);

    await deleteAllData();
    expect(await listUnits()).toEqual([]);
    expect(await listTrainees()).toEqual([]);
  });

  it('exports and merges all record types by id', async () => {
    const unit = { id: 'unit-1', name: 'North Cell', createdAt: 10 };
    const trainee = { id: 'trainee-1', callsign: 'Echo', unitId: unit.id, createdAt: 11 };
    await saveUnit(unit);
    await saveTrainee(trainee);
    await saveSetting({ key: 'theme', value: 'cream' });
    const exported = await exportData();

    await deleteAllData();
    expect(await importData(exported)).toEqual({ merged: 3 });
    expect(await listUnits()).toEqual([unit]);
    expect(await listTrainees()).toEqual([trainee]);
    expect((await exportData()).settings).toEqual([{ key: 'theme', value: 'cream' }]);
    await expect(importData({ ...exported, formatVersion: 99 })).rejects.toThrow(
      'This file is not a supported VAJRA data export.'
    );
  });

  it('stores and re-scores a replayable session with the same final hash', async () => {
    const engine = new Engine('storage-replay-seed', 'dawn_intrusion');
    while (!engine.missionState.ended) engine.step();
    const sessionLog = engine.getSessionLog();
    const rescored = rescoreSession(sessionLog);

    expect(rescored.hash).toBe(engine.getHash());
    expect(rescored.report.grade).toBeDefined();

    await saveSession({
      id: 'session-1',
      traineeId: 'trainee-1',
      unitId: 'unit-1',
      startedAt: 123,
      scenarioKey: 'dawn_intrusion',
      tier: 'scripted',
      focus: 'none',
      seed: sessionLog.seed,
      sessionLog,
      scoreVersion: SCORE_VERSION,
      report: rescored.report,
      summary: {
        total: rescored.report.total,
        grade: rescored.report.grade,
        subscores: rescored.report.subscores,
        hostilesTotal: 1,
        hostilesNeutralised: 1,
        assetHit: false,
        durationTicks: sessionLog.totalTicks,
      },
      hash: rescored.hash,
    });

    const [stored] = await listSessions();
    expect(stored?.hash).toBe(rescored.hash);
    expect(rescoreSession(stored!.sessionLog).hash).toBe(stored?.hash);
  });

  it('imports v1 session exports and migrates old sessions and logs without fork fields', async () => {
    const engine = new Engine('legacy-session-seed', 'sandbox');
    engine.stepN(8);
    const log = engine.getSessionLog();
    const rescored = rescoreSession(log);
    await saveSession({
      id: 'legacy-session', traineeId: 'trainee-1', unitId: 'unit-1', startedAt: 10,
      scenarioKey: 'sandbox', tier: 'scripted', focus: 'none', seed: log.seed,
      sessionLog: { ...log, formatVersion: 1, forkOf: undefined }, scoreVersion: SCORE_VERSION,
      report: rescored.report,
      summary: { total: 0, grade: 'Unsatisfactory', subscores: rescored.report.subscores, hostilesTotal: 0, hostilesNeutralised: 0, assetHit: false, durationTicks: 8 },
      hash: rescored.hash,
    });
    const currentExport = await exportData();
    const legacySession = currentExport.sessions[0]!;
    const oldSession = { ...legacySession };
    delete oldSession.isFork;
    delete oldSession.parentId;
    delete oldSession.forkTick;
    const legacyLog = { ...oldSession.sessionLog, formatVersion: 1 };
    delete (legacyLog as { forkOf?: unknown }).forkOf;

    await deleteAllData();
    await importData({ ...currentExport, formatVersion: 1, sessions: [{ ...oldSession, sessionLog: legacyLog }] });
    const [migrated] = await listSessions();
    expect(migrated?.isFork).toBe(false);
    expect(migrated?.parentId).toBeUndefined();
    expect(migrated?.forkTick).toBeUndefined();
    expect(migrated?.sessionLog.formatVersion).toBe(3);
    expect(migrated?.sessionLog.forkOf).toBeUndefined();
  });

  it('persists fork parent metadata for comparison records', async () => {
    const engine = new Engine('fork-storage-seed', 'sandbox');
    engine.stepN(10);
    const sessionLog = { ...engine.getSessionLog(), forkOf: { parentId: 'original-session', tick: 4 } };
    const rescored = rescoreSession(sessionLog);
    const id = await persistMissionReport({
      scoreV2: rescored.report,
      sessionLog,
      hash: rescored.hash,
      scoreVersion: SCORE_VERSION,
      summary: {
        total: rescored.report.total, grade: rescored.report.grade, subscores: rescored.report.subscores,
        hostilesTotal: 0, hostilesNeutralised: 0, assetHit: false, durationTicks: 10,
      },
    }, 20, { traineeId: 'trainee-fork', unitId: 'unit-fork' }, { parentId: 'original-session', forkTick: 4 });
    const stored = (await listSessions()).find((session) => session.id === id);
    expect(stored).toMatchObject({ parentId: 'original-session', forkTick: 4, isFork: true });
    expect(stored?.sessionLog.forkOf).toEqual({ parentId: 'original-session', tick: 4 });
  });
});
