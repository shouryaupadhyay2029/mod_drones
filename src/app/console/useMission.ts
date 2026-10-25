import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommandInput,
  ScoreReport,
  ScoreReportV2,
  SessionLog,
  ThreatClassId,
  TraineeView,
  referenceOperator,
} from '../../sim/index.js';
import { SimClient } from '../simClient.js';
import { persistMissionReport, SessionOwner } from '../storage/sessionPersistence.js';
import { PendingForkLaunch, takePendingFork } from '../aar/forkLaunch.js';
import { TrailPoint, updateTrailHistory } from './radar/trails.js';

export type MissionPhase = 'setup' | 'running' | 'ended';

export interface MissionStartOptions extends SessionOwner {
  avoidFingerprints?: string[];
}

export interface UseMissionReturn {
  phase: MissionPhase;
  seed: string;
  scenarioId: string;
  speed: 1 | 2 | 4;
  isPaused: boolean;
  autopilot: boolean;
  view: TraineeView | null;
  selectedTrackId: number | null;
  trailHistory: Map<number, Array<{ x: number; y: number; z: number }>>;
  scoreReport: ScoreReport | null;
  scoreReportV2: ScoreReportV2 | null;
  sessionLog: SessionLog | null;
  storageStatus: string;
  forkContext: PendingForkLaunch | null;
  startMission: (seed: string, scenarioId?: string, options?: MissionStartOptions) => void;
  togglePause: () => void;
  setSpeedMultiplier: (speed: 1 | 2 | 4) => void;
  toggleAutopilot: () => void;
  selectTrack: (trackId: number | null) => void;
  acknowledgeTrack: (trackId: number) => void;
  classifyTrack: (trackId: number, classId: ThreatClassId | 'unknown') => void;
  engageTrack: (trackId: number, effector: 'jammer' | 'gun') => void;
  holdFireTrack: (trackId: number) => void;
  lockEoTrack: (trackId: number) => void;
  releaseEo: () => void;
  toggleEoChannel: () => void;
  resetToSetup: (newSeed?: string) => void;
}

export function useMission(initialSeed?: string): UseMissionReturn {
  const [phase, setPhase] = useState<MissionPhase>('setup');
  const [seed, setSeed] = useState<string>(initialSeed ?? 'alpha-omega-42');
  const [scenarioId, setScenarioId] = useState<string>('dawn_intrusion');
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autopilot, setAutopilot] = useState<boolean>(false);
  const [view, setView] = useState<TraineeView | null>(null);
  const viewRef = useRef<TraineeView | null>(null);
  viewRef.current = view;
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [scoreReportV2, setScoreReportV2] = useState<ScoreReportV2 | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionLog | null>(null);
  const [storageStatus, setStorageStatus] = useState<string>('');
  const [forkContext, setForkContext] = useState<PendingForkLaunch | null>(null);
  const missionStartedAtRef = useRef<number>(0);
  const scenarioIdRef = useRef<string>('dawn_intrusion');
  const savedReportHashRef = useRef<string>('');
  const activeOwnerRef = useRef<SessionOwner | undefined>(undefined);
  const activeForkRef = useRef<PendingForkLaunch | null>(null);
  const pendingForkRef = useRef<PendingForkLaunch | null>(null);

  const clientRef = useRef<SimClient | null>(null);
  const trailHistoryRef = useRef<Map<number, TrailPoint[]>>(new Map());
  const autopilotRef = useRef<boolean>(autopilot);
  autopilotRef.current = autopilot;

  // Initialize client on mount
  useEffect(() => {
    const client = new SimClient();
    clientRef.current = client;

    client.onView((newView) => {
      setView(newView);

      // Update trail history (last 6 plots, changed lastPlotTick only, drop missing tracks)
      if (newView.tracks) {
        updateTrailHistory(trailHistoryRef.current, newView.tracks);
      }

      // Autopilot handling: if enabled, pass view to referenceOperator
      if (autopilotRef.current && !newView.missionState.ended) {
        const commands = referenceOperator(newView);
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i];
          if (cmd) {
            client.enqueue(cmd);
          }
        }
      }
    });

    client.onReport((report) => {
      if (savedReportHashRef.current === report.hash) return;
      savedReportHashRef.current = report.hash;
      setScoreReport(report.score);
      setScoreReportV2(report.scoreV2);
      setSessionLog(report.sessionLog);
      setPhase('ended');
      setStorageStatus('Saving session locally…');
      void persistMissionReport(
        { ...report, sessionLog: { ...report.sessionLog, scenarioId: report.sessionLog.scenarioId ?? scenarioIdRef.current } },
        missionStartedAtRef.current,
        activeOwnerRef.current,
        activeForkRef.current ? { parentId: activeForkRef.current.parentId, forkTick: activeForkRef.current.tick } : undefined
      )
        .then((savedId) => {
          setStorageStatus(activeForkRef.current ? 'Fork saved for comparison.' : 'Session saved on this device.');
          if (activeForkRef.current) {
            window.location.hash = `#/aar/compare/${encodeURIComponent(activeForkRef.current.parentId)}/${encodeURIComponent(savedId)}`;
          }
        })
        .catch((error: unknown) => {
          console.error('[SessionStorage] Failed to save session:', error);
          setStorageStatus('Session could not be saved locally.');
        });
    });

    if (typeof window !== 'undefined' && window.location?.hash === '#/fork') {
      const pending = pendingForkRef.current ?? takePendingFork();
      if (pending) {
        pendingForkRef.current = pending;
        activeForkRef.current = pending;
        activeOwnerRef.current = pending.traineeId && pending.unitId
          ? { traineeId: pending.traineeId, unitId: pending.unitId }
          : undefined;
        setForkContext(pending);
        setSeed(String(pending.sessionLog.seed));
        setScenarioId(pending.sessionLog.scenarioId ?? 'dawn_intrusion');
        scenarioIdRef.current = pending.sessionLog.scenarioId ?? 'dawn_intrusion';
        missionStartedAtRef.current = Date.now();
        setSpeed(1);
        setIsPaused(true);
        setAutopilot(false);
        setPhase('running');
        client.initFromFork(pending.sessionLog, pending.tick, pending.parentId);
      }
    }

    return () => {
      client.terminate();
    };
  }, []);

  const startMission = useCallback(
    (newSeed: string, newScenarioId?: string, options?: MissionStartOptions) => {
      const client = clientRef.current;
      if (!client) return;

      const chosenScenario = newScenarioId ?? scenarioId;
      setScenarioId(chosenScenario);
      scenarioIdRef.current = chosenScenario;
      missionStartedAtRef.current = Date.now();
      savedReportHashRef.current = '';
      activeForkRef.current = null;
      pendingForkRef.current = null;
      setForkContext(null);
      if (options) {
        activeOwnerRef.current = options.traineeId && options.unitId
          ? { traineeId: options.traineeId, unitId: options.unitId }
          : undefined;
      }

      trailHistoryRef.current.clear();
      setScoreReport(null);
      setScoreReportV2(null);
      setSessionLog(null);
      setSelectedTrackId(null);
      setSeed(newSeed);
      setSpeed(1);
      setIsPaused(false);
      setPhase('running');

      client.init(newSeed, chosenScenario, options?.avoidFingerprints ?? []);
      client.setSpeed(1);
      client.start();
    },
    [scenarioId]
  );

  const togglePause = useCallback(() => {
    const client = clientRef.current;
    if (!client || phase !== 'running') return;

    if (isPaused) {
      client.start();
      setIsPaused(false);
    } else {
      client.pause();
      setIsPaused(true);
    }
  }, [isPaused, phase]);

  const setSpeedMultiplier = useCallback((newSpeed: 1 | 2 | 4) => {
    const client = clientRef.current;
    if (!client) return;
    client.setSpeed(newSpeed);
    setSpeed(newSpeed);
  }, []);

  const toggleAutopilot = useCallback(() => {
    const next = !autopilotRef.current;
    autopilotRef.current = next;
    setAutopilot(next);

    // Side effect executes strictly outside the setState updater
    if (next && view && clientRef.current && !view.missionState.ended) {
      const commands = referenceOperator(view);
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        if (cmd) clientRef.current.enqueue(cmd);
      }
    }
  }, [view]);

  const selectTrack = useCallback((trackId: number | null) => {
    setSelectedTrackId(trackId);
  }, []);

  const acknowledgeTrack = useCallback((trackId: number) => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: CommandInput = {
      type: 'ACK_TRACK',
      payload: { trackId },
    };
    client.enqueue(cmd);
  }, []);

  const classifyTrack = useCallback(
    (trackId: number, classId: ThreatClassId | 'unknown') => {
      const client = clientRef.current;
      if (!client) return;
      const cmd: CommandInput = {
        type: 'CLASSIFY_TRACK',
        payload: { trackId, assessedClass: classId },
      };
      client.enqueue(cmd);
    },
    []
  );

  const engageTrack = useCallback((trackId: number, effector: 'jammer' | 'gun') => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: CommandInput = {
      type: 'ENGAGE_TRACK',
      payload: { trackId, effector },
    };
    client.enqueue(cmd);
  }, []);

  const holdFireTrack = useCallback((trackId: number) => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: CommandInput = {
      type: 'HOLD_FIRE',
      payload: { trackId },
    };
    client.enqueue(cmd);
  }, []);

  const lockEoTrack = useCallback((trackId: number) => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: CommandInput = {
      type: 'EO_LOCK',
      payload: { trackId },
    };
    client.enqueue(cmd);
  }, []);

  const releaseEo = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: CommandInput = {
      type: 'EO_RELEASE',
      payload: {},
    };
    client.enqueue(cmd);
  }, []);

  const toggleEoChannel = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const currentChannel = viewRef.current?.eo?.channel ?? 'tv';
    const nextChannel = currentChannel === 'tv' ? 'ir' : 'tv';
    const cmd: CommandInput = {
      type: 'EO_CHANNEL',
      payload: { channel: nextChannel },
    };
    client.enqueue(cmd);
  }, []);

  const resetToSetup = useCallback((newSeed?: string) => {
    const client = clientRef.current;
    if (client) {
      client.pause();
    }
    if (newSeed) {
      setSeed(newSeed);
    }
    setView(null);
    setSelectedTrackId(null);
    setScoreReport(null);
    setScoreReportV2(null);
    setSessionLog(null);
    setPhase('setup');
    activeForkRef.current = null;
    setForkContext(null);
  }, []);

  return {
    phase,
    seed,
    scenarioId,
    speed,
    isPaused,
    autopilot,
    view,
    selectedTrackId,
    trailHistory: trailHistoryRef.current,
    scoreReport,
    scoreReportV2,
    sessionLog,
    storageStatus,
    forkContext,
    startMission,
    togglePause,
    setSpeedMultiplier,
    toggleAutopilot,
    selectTrack,
    acknowledgeTrack,
    classifyTrack,
    engageTrack,
    holdFireTrack,
    lockEoTrack,
    releaseEo,
    toggleEoChannel,
    resetToSetup,
  };
}
