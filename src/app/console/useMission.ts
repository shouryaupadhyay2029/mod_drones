import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommandInput,
  ScoreReport,
  SessionLog,
  ThreatClassId,
  TraineeView,
  referenceOperator,
} from '../../sim/index.js';
import { SimClient } from '../simClient.js';
import { TrailPoint, updateTrailHistory } from './radar/trails.js';

export type MissionPhase = 'setup' | 'running' | 'ended';

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
  sessionLog: SessionLog | null;
  startMission: (seed: string, scenarioId?: string) => void;
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
  const [sessionLog, setSessionLog] = useState<SessionLog | null>(null);

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
      setScoreReport(report.score);
      setSessionLog(report.sessionLog);
      setPhase('ended');
    });

    return () => {
      client.terminate();
    };
  }, []);

  const startMission = useCallback(
    (newSeed: string, newScenarioId?: string) => {
      const client = clientRef.current;
      if (!client) return;

      const chosenScenario = newScenarioId ?? scenarioId;
      setScenarioId(chosenScenario);

      trailHistoryRef.current.clear();
      setScoreReport(null);
      setSessionLog(null);
      setSelectedTrackId(null);
      setSeed(newSeed);
      setSpeed(1);
      setIsPaused(false);
      setPhase('running');

      client.init(newSeed, chosenScenario);
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
    setSessionLog(null);
    setPhase('setup');
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
    sessionLog,
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
