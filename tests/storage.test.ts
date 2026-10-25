import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Engine, rescoreSession, SCORE_VERSION } from '../src/sim/index.js';
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

  it('creates the version 1 stores and supports typed record CRUD', async () => {
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
});
