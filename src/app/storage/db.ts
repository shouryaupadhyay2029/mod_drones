import { ScoreReportV2, SessionLog } from '../../sim/index.js';

export const VAJRA_DB_NAME = 'vajra';
export const VAJRA_DB_VERSION = 1;
export const VAJRA_DATA_FORMAT = 'vajra-local-data';
export const VAJRA_DATA_FORMAT_VERSION = 1;

export interface TraineeRecord {
  id: string;
  callsign: string;
  unitId: string;
  createdAt: number;
}

export interface UnitRecord {
  id: string;
  name: string;
  createdAt: number;
}

export interface SessionSummary {
  total: number;
  grade: ScoreReportV2['grade'];
  subscores: ScoreReportV2['subscores'];
  hostilesTotal: number;
  hostilesNeutralised: number;
  assetHit: boolean;
  durationTicks: number;
}

export interface SessionRecord {
  id: string;
  traineeId: string;
  unitId: string;
  startedAt: number;
  scenarioKey: string;
  tier: string;
  focus: string;
  seed: string | number;
  sessionLog: SessionLog;
  scoreVersion: string;
  report: ScoreReportV2;
  summary: SessionSummary;
  hash: string;
  hashMismatch?: boolean;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface VajraExport {
  format: typeof VAJRA_DATA_FORMAT;
  formatVersion: typeof VAJRA_DATA_FORMAT_VERSION;
  exportedAt: number;
  trainees: TraineeRecord[];
  units: UnitRecord[];
  sessions: SessionRecord[];
  settings: SettingRecord[];
}

interface StoreRecords {
  trainees: TraineeRecord;
  units: UnitRecord;
  sessions: SessionRecord;
  settings: SettingRecord;
}

type StoreName = keyof StoreRecords;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VAJRA_DB_NAME, VAJRA_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 1) {
        const trainees = db.createObjectStore('trainees', { keyPath: 'id' });
        trainees.createIndex('unitId', 'unitId', { unique: false });
        db.createObjectStore('units', { keyPath: 'id' });
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('traineeId', 'traineeId', { unique: false });
        sessions.createIndex('unitId', 'unitId', { unique: false });
        sessions.createIndex('startedAt', 'startedAt', { unique: false });
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Failed to open local data store.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Local data store upgrade is blocked by another open tab.'));
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

async function getAll<T extends StoreName>(storeName: T): Promise<StoreRecords[T][]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestResult(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return result as StoreRecords[T][];
}

async function putRecord<T extends StoreName>(storeName: T, value: StoreRecords[T]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

export const listTrainees = (): Promise<TraineeRecord[]> => getAll('trainees');
export const listUnits = (): Promise<UnitRecord[]> => getAll('units');
export const listSessions = async (): Promise<SessionRecord[]> =>
  (await getAll('sessions')).sort((a, b) => b.startedAt - a.startedAt);
export const listSettings = (): Promise<SettingRecord[]> => getAll('settings');

export const saveTrainee = (record: TraineeRecord): Promise<void> => putRecord('trainees', record);
export const saveUnit = (record: UnitRecord): Promise<void> => putRecord('units', record);
export const saveSession = (record: SessionRecord): Promise<void> => putRecord('sessions', record);
export const saveSetting = (record: SettingRecord): Promise<void> => putRecord('settings', record);

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction('settings', 'readonly');
  const result = await requestResult(transaction.objectStore('settings').get(key)) as SettingRecord | undefined;
  await transactionDone(transaction);
  return result?.value as T | undefined;
}

export async function exportData(): Promise<VajraExport> {
  const [trainees, units, sessions, settings] = await Promise.all([
    listTrainees(),
    listUnits(),
    listSessions(),
    listSettings(),
  ]);
  return {
    format: VAJRA_DATA_FORMAT,
    formatVersion: VAJRA_DATA_FORMAT_VERSION,
    exportedAt: Date.now(),
    trainees,
    units,
    sessions,
    settings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordsFromExport<T extends StoreName>(payload: VajraExport, storeName: T): StoreRecords[T][] {
  return payload[storeName] as StoreRecords[T][];
}

export async function importData(value: unknown): Promise<{ merged: number }> {
  if (
    !isRecord(value) ||
    value.format !== VAJRA_DATA_FORMAT ||
    value.formatVersion !== VAJRA_DATA_FORMAT_VERSION ||
    !Array.isArray(value.trainees) ||
    !Array.isArray(value.units) ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.settings)
  ) {
    throw new Error('This file is not a supported VAJRA data export.');
  }

  const payload = value as unknown as VajraExport;
  const storeNames: StoreName[] = ['trainees', 'units', 'sessions', 'settings'];
  const db = await openDatabase();
  const transaction = db.transaction(storeNames, 'readwrite');
  let merged = 0;
  for (const storeName of storeNames) {
    const store = transaction.objectStore(storeName);
    for (const record of recordsFromExport(payload, storeName)) {
      store.put(record);
      merged++;
    }
  }
  await transactionDone(transaction);
  return { merged };
}

export async function deleteAllData(): Promise<void> {
  const db = await openDatabase();
  const storeNames: StoreName[] = ['trainees', 'units', 'sessions', 'settings'];
  const transaction = db.transaction(storeNames, 'readwrite');
  for (const storeName of storeNames) transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

export function createLocalId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure local IDs are unavailable in this browser.');
  }
  return crypto.randomUUID();
}

export async function ensureGuestProfile(): Promise<{ traineeId: string; unitId: string }> {
  const [savedUnitId, savedTraineeId, units, trainees] = await Promise.all([
    getSetting<string>('defaultUnitId'),
    getSetting<string>('defaultTraineeId'),
    listUnits(),
    listTrainees(),
  ]);

  let unitId = savedUnitId && units.some((unit) => unit.id === savedUnitId) ? savedUnitId : '';
  if (!unitId) {
    const existingUnit = units.find((unit) => unit.name === 'Local Training');
    unitId = existingUnit?.id ?? createLocalId();
    if (!existingUnit) await saveUnit({ id: unitId, name: 'Local Training', createdAt: Date.now() });
    await saveSetting({ key: 'defaultUnitId', value: unitId });
  }

  let traineeId = savedTraineeId && trainees.some((trainee) => trainee.id === savedTraineeId)
    ? savedTraineeId
    : '';
  if (!traineeId) {
    const existingTrainee = trainees.find((trainee) => trainee.callsign === 'Guest');
    traineeId = existingTrainee?.id ?? createLocalId();
    if (!existingTrainee) {
      await saveTrainee({ id: traineeId, callsign: 'Guest', unitId, createdAt: Date.now() });
    }
    await saveSetting({ key: 'defaultTraineeId', value: traineeId });
  }

  return { traineeId, unitId };
}
