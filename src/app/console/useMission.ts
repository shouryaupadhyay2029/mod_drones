import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Command,
  ScoreReport,
  SessionLog,
  ThreatClassId,
  TraineeView,
  referenceOperator,
} from '../../sim/index.js';
import { SimClient } from '../simClient.js';

export type MissionPhase = 'setup' | 'running' | 'ended';

export interface UseMissionReturn {
  phase: MissionPhase;
  seed: string;
  speed: 1 | 2 | 4;
  isPaused: boolean;
  autopilot: boolean;
  view: TraineeView | null;
  selectedTrackId: number | null;
  trailHistory: Map<number, Array<{ x: number; y: number; z: number }>>;
  scoreReport: ScoreReport | null;
  sessionLog: SessionLog | null;
  startMission: (seed: string) => void;
  togglePause: () => void;
  setSpeedMultiplier: (speed: 1 | 2 | 4) => void;
  toggleAutopilot: () => void;
  selectTrack: (trackId: number | null) => void;
  acknowledgeTrack: (trackId: number) => void;
  classifyTrack: (trackId: number, classId: ThreatClassId | 'unknown') => void;
  engageTrack: (trackId: number, effector: 'jammer' | 'gun') => void;
  holdFireTrack: (trackId: number) => void;
  resetToSetup: (newSeed?: string) => void;
}

export function useMission(initialSeed?: string): UseMissionReturn {
  const [phase, setPhase] = useState<MissionPhase>('setup');
  const [seed, setSeed] = useState<string>(initialSeed ?? 'alpha-omega-42');
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autopilot, setAutopilot] = useState<boolean>(false);
  const [view, setView] = useState<TraineeView | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionLog | null>(null);

  const clientRef = useRef<SimClient | null>(null);
  const trailHistoryRef = useRef<Map<number, Array<{ x: number; y: number; z: number }>>>(
    new Map()
  );
  const autopilotRef = useRef<boolean>(autopilot);
  autopilotRef.current = autopilot;

  // Initialize client on mount
  useEffect(() => {
    const client = new SimClient();
    clientRef.current = client;

    client.onView((newView) => {
      setView(newView);

      // Update trail history (last 6 plots)
      if (newView.tracks) {
        for (let i = 0; i < newView.tracks.length; i++) {
          const t = newView.tracks[i];
          if (!t) continue;
          let list = trailHistoryRef.current.get(t.trackId);
          if (!list) {
            list = [];
            trailHistoryRef.current.set(t.trackId, list);
          }
          list.push({ ...t.estimatedPosition });
          if (list.length > 6) {
            list.shift();
          }
        }
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
    (newSeed: string) => {
      const client = clientRef.current;
      if (!client) return;

      trailHistoryRef.current.clear();
      setScoreReport(null);
      setSessionLog(null);
      setSelectedTrackId(null);
      setSeed(newSeed);
      setSpeed(1);
      setIsPaused(false);
      setPhase('running');

      client.init(newSeed, 'dawn_intrusion');
      client.setSpeed(1);
      client.start();
    },
    []
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
    setAutopilot((prev) => {
      const next = !prev;
      autopilotRef.current = next;
      // If turning on autopilot and we have a current view, dispatch immediately
      if (next && view && clientRef.current && !view.missionState.ended) {
        const commands = referenceOperator(view);
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i];
          if (cmd) clientRef.current.enqueue(cmd);
        }
      }
      return next;
    });
  }, [view]);

  const selectTrack = useCallback((trackId: number | null) => {
    setSelectedTrackId(trackId);
  }, []);

  const acknowledgeTrack = useCallback((trackId: number) => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: Command = {
      tick: 0, // Engine stamps current tick
      type: 'ACK_TRACK',
      payload: { trackId },
    };
    client.enqueue(cmd);
  }, []);

  const classifyTrack = useCallback(
    (trackId: number, classId: ThreatClassId | 'unknown') => {
      const client = clientRef.current;
      if (!client) return;
      const cmd: Command = {
        tick: 0,
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
    const cmd: Command = {
      tick: 0,
      type: 'ENGAGE_TRACK',
      payload: { trackId, effector },
    };
    client.enqueue(cmd);
  }, []);

  const holdFireTrack = useCallback((trackId: number) => {
    const client = clientRef.current;
    if (!client) return;
    const cmd: Command = {
      tick: 0,
      type: 'HOLD_FIRE',
      payload: { trackId },
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
    resetToSetup,
  };
}
