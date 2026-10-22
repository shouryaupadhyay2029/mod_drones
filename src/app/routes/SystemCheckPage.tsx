import React, { useEffect, useRef, useState } from 'react';
import { Engine, replay } from '../../sim/index.js';
import { SimClient, SimStateUpdate } from '../simClient.js';

export function SystemCheckPage(): React.JSX.Element {
  const [seedInput, setSeedInput] = useState<string>('alpha-omega-42');
  const [currentSeed, setCurrentSeed] = useState<string>('alpha-omega-42');
  const [simState, setSimState] = useState<SimStateUpdate>({
    tick: 0,
    hash: '----------------',
    entityCount: 0,
    isRunning: false,
  });

  const [tps, setTps] = useState<number>(0);
  const [replayResult, setReplayResult] = useState<{
    status: 'IDLE' | 'PASS' | 'FAIL';
    liveHash?: string;
    replayHash?: string;
    ticks?: number;
  }>({ status: 'IDLE' });

  const [snapshotResult, setSnapshotResult] = useState<{
    status: 'IDLE' | 'PASS' | 'FAIL';
    baselineHash?: string;
    restoredHash?: string;
    ticksTested?: number;
  }>({ status: 'IDLE' });

  const clientRef = useRef<SimClient | null>(null);
  const lastTickCountRef = useRef<number>(0);
  const lastTpsTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const client = new SimClient();
    clientRef.current = client;

    client.onState((st) => {
      setSimState(st);
    });

    client.init(currentSeed);

    // Speed calculation interval (ticks/sec)
    const tpsTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTpsTimeRef.current) / 1000;
      if (dt > 0.3) {
        const curTick = client.getLastState().tick;
        const tickDelta = curTick - lastTickCountRef.current;
        setTps(Math.round(tickDelta / dt));
        lastTickCountRef.current = curTick;
        lastTpsTimeRef.current = now;
      }
    }, 500);

    return () => {
      clearInterval(tpsTimer);
      client.terminate();
    };
  }, []);

  const handleStart = () => {
    clientRef.current?.start();
  };

  const handlePause = () => {
    clientRef.current?.pause();
  };

  const handleReset = () => {
    clientRef.current?.init(seedInput);
    setCurrentSeed(seedInput);
    setReplayResult({ status: 'IDLE' });
    setSnapshotResult({ status: 'IDLE' });
    lastTickCountRef.current = 0;
    lastTpsTimeRef.current = performance.now();
    setTps(0);
  };

  const handleSpawnEntity = () => {
    const client = clientRef.current;
    if (!client) return;
    const currentTick = client.getLastState().tick;
    // Enqueue spawn command with omitted x/y so engine RNG picks position deterministically
    client.enqueue({
      tick: currentTick,
      type: 'SPAWN_ENTITY',
      payload: {},
    });
  };

  const handleVerifyReplay = async () => {
    const client = clientRef.current;
    if (!client) return;

    // Fetch the session log from the worker
    const sessionLog = await client.getSessionLog();
    const liveHash = client.getLastState().hash;

    // Run replay on the main thread
    const replayedHash = replay(sessionLog);
    const pass = liveHash === replayedHash;

    setReplayResult({
      status: pass ? 'PASS' : 'FAIL',
      liveHash,
      replayHash: replayedHash,
      ticks: sessionLog.totalTicks,
    });
  };

  const handleVerifySnapshot = async () => {
    const client = clientRef.current;
    if (!client) return;

    // Pause briefly to get a stable snapshot
    const wasRunning = client.getLastState().isRunning;
    if (wasRunning) {
      client.pause();
      // Wait for pause to apply
      await new Promise((r) => setTimeout(r, 60));
    }

    const rawSnapshot = await client.snapshot();

    // Verify snapshot survives JSON.stringify / JSON.parse round-trip
    const serializedSnapshot = JSON.parse(JSON.stringify(rawSnapshot));

    // Baseline: clone original snapshot into Engine A and step 500
    const engineA = Engine.restore(rawSnapshot);
    engineA.stepN(500);
    const hashA = engineA.getHash();

    // Restored: restore from JSON round-trip into Engine B and step 500
    const engineB = Engine.restore(serializedSnapshot);
    engineB.stepN(500);
    const hashB = engineB.getHash();

    const pass = hashA === hashB;

    setSnapshotResult({
      status: pass ? 'PASS' : 'FAIL',
      baselineHash: hashA,
      restoredHash: hashB,
      ticksTested: 500,
    });

    if (wasRunning) {
      client.start();
    }
  };

  return (
    <div style={styles.container}>
      {/* Disclaimer Banner */}
      <header style={styles.banner}>
        <div style={styles.bannerTag}>NOTICE</div>
        <div style={styles.bannerText}>
          TRAINING SIMULATION — generic open-source parameters only.
        </div>
      </header>

      {/* Main Container */}
      <main style={styles.main}>
        <div style={styles.titleSection}>
          <h1 style={styles.title}>System Check</h1>
          <span style={styles.versionBadge}>PHASE 0 • DETERMINISTIC CORE</span>
        </div>

        {/* Live Metrics Grid */}
        <section style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>TICK</div>
            <div style={styles.metricValue}>{simState.tick.toLocaleString()}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>STATE HASH</div>
            <div style={{ ...styles.metricValue, ...styles.monoHash }}>
              {simState.hash || 'COMPUTING...'}
            </div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>ENTITIES</div>
            <div style={styles.metricValue}>{simState.entityCount}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>SPEED (TICKS/SEC)</div>
            <div style={styles.metricValue}>
              {tps} <span style={styles.unitText}>tps</span>
            </div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>RUN STATE</div>
            <div
              style={{
                ...styles.metricValue,
                color: simState.isRunning ? '#4ade80' : '#f87171',
              }}
            >
              {simState.isRunning ? 'RUNNING' : 'PAUSED'}
            </div>
          </div>
        </section>

        {/* Controls Section */}
        <section style={styles.controlPanel}>
          <div style={styles.seedRow}>
            <label htmlFor="seedInput" style={styles.fieldLabel}>
              SIM SEED:
            </label>
            <input
              id="seedInput"
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              style={styles.input}
              placeholder="Enter seed string or number..."
            />
            <button onClick={handleReset} style={styles.buttonSecondary}>
              Reset With Seed
            </button>
          </div>

          <div style={styles.buttonRow}>
            <button
              onClick={handleStart}
              disabled={simState.isRunning}
              style={{
                ...styles.buttonPrimary,
                opacity: simState.isRunning ? 0.5 : 1,
              }}
            >
              Start
            </button>
            <button
              onClick={handlePause}
              disabled={!simState.isRunning}
              style={{
                ...styles.buttonSecondary,
                opacity: !simState.isRunning ? 0.5 : 1,
              }}
            >
              Pause
            </button>
            <button onClick={handleSpawnEntity} style={styles.buttonAction}>
              Spawn Test Entity
            </button>
          </div>
        </section>

        {/* Verification Checks */}
        <section style={styles.verificationSection}>
          <h2 style={styles.sectionHeader}>Deterministic Verification Diagnostics</h2>

          {/* Replay Verification */}
          <div style={styles.verifyCard}>
            <div style={styles.verifyHeaderRow}>
              <div>
                <h3 style={styles.verifyTitle}>Replay Verification</h3>
                <p style={styles.verifyDesc}>
                  Replays the entire command log through a fresh Engine to confirm 100% bit-parity.
                </p>
              </div>
              <button
                id="btn-verify-replay"
                onClick={handleVerifyReplay}
                style={styles.buttonVerify}
              >
                Verify Replay
              </button>
            </div>
            {replayResult.status !== 'IDLE' && (
              <div
                style={{
                  ...styles.resultBox,
                  borderColor: replayResult.status === 'PASS' ? '#22c55e' : '#ef4444',
                }}
              >
                <div style={styles.resultBadgeRow}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor: replayResult.status === 'PASS' ? '#15803d' : '#b91c1c',
                    }}
                  >
                    {replayResult.status}
                  </span>
                  <span style={styles.resultSummary}>
                    Evaluated across {replayResult.ticks?.toLocaleString()} ticks
                  </span>
                </div>
                <div style={styles.hashCompareRow}>
                  <div>
                    <span style={styles.subLabel}>Live Hash: </span>
                    <code style={styles.codeHash}>{replayResult.liveHash}</code>
                  </div>
                  <div>
                    <span style={styles.subLabel}>Replay Hash: </span>
                    <code style={styles.codeHash}>{replayResult.replayHash}</code>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Snapshot Verification */}
          <div style={styles.verifyCard}>
            <div style={styles.verifyHeaderRow}>
              <div>
                <h3 style={styles.verifyTitle}>Snapshot & Restore Verification</h3>
                <p style={styles.verifyDesc}>
                  Captures current state, passes through JSON serialization, advances both engines
                  500 ticks.
                </p>
              </div>
              <button
                id="btn-verify-snapshot"
                onClick={handleVerifySnapshot}
                style={styles.buttonVerify}
              >
                Verify Snapshot
              </button>
            </div>
            {snapshotResult.status !== 'IDLE' && (
              <div
                style={{
                  ...styles.resultBox,
                  borderColor: snapshotResult.status === 'PASS' ? '#22c55e' : '#ef4444',
                }}
              >
                <div style={styles.resultBadgeRow}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor: snapshotResult.status === 'PASS' ? '#15803d' : '#b91c1c',
                    }}
                  >
                    {snapshotResult.status}
                  </span>
                  <span style={styles.resultSummary}>
                    Advanced both branches by {snapshotResult.ticksTested} ticks
                  </span>
                </div>
                <div style={styles.hashCompareRow}>
                  <div>
                    <span style={styles.subLabel}>Baseline Hash: </span>
                    <code style={styles.codeHash}>{snapshotResult.baselineHash}</code>
                  </div>
                  <div>
                    <span style={styles.subLabel}>Restored Hash: </span>
                    <code style={styles.codeHash}>{snapshotResult.restoredHash}</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0b0b0b',
    color: '#e4e4e7',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    display: 'flex',
    flexDirection: 'column',
  },
  banner: {
    backgroundColor: '#000000',
    borderBottom: '1px solid #1a1a1a',
    padding: '10px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  bannerTag: {
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.05em',
    boxShadow: '0 0 8px rgba(255, 45, 171, 0.4)',
  },
  bannerText: {
    color: '#a1a1aa',
    fontSize: '13px',
    fontWeight: 500,
  },
  main: {
    maxWidth: '1000px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  titleSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    borderBottom: '1px solid #262626',
    paddingBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#ffffff',
  },
  versionBadge: {
    backgroundColor: '#121212',
    border: '1px solid #ff2dab',
    color: '#ff2dab',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    boxShadow: '0 0 8px rgba(255, 45, 171, 0.3)',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  metricCard: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '16px',
  },
  metricLabel: {
    color: '#a1a1aa',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  metricValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  monoHash: {
    fontSize: '14px',
    color: '#ff2dab',
  },
  unitText: {
    fontSize: '13px',
    color: '#71717a',
    fontWeight: 400,
  },
  controlPanel: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  seedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#a1a1aa',
    letterSpacing: '0.05em',
  },
  input: {
    backgroundColor: '#080808',
    border: '1px solid #262626',
    color: '#ffffff',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
    flex: '1 1 200px',
    outline: 'none',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  buttonPrimary: {
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(255, 45, 171, 0.4)',
  },
  buttonSecondary: {
    backgroundColor: '#171717',
    color: '#ffffff',
    border: '1px solid #262626',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonAction: {
    backgroundColor: '#171717',
    color: '#ff2dab',
    border: '1px solid rgba(255, 45, 171, 0.4)',
    borderRadius: '6px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonVerify: {
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    boxShadow: '0 0 10px rgba(255, 45, 171, 0.4)',
  },
  verificationSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionHeader: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ff2dab',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    margin: '8px 0 0 0',
  },
  verifyCard: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  verifyHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  verifyTitle: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  verifyDesc: {
    margin: 0,
    fontSize: '12px',
    color: '#a1a1aa',
  },
  resultBox: {
    backgroundColor: '#080808',
    border: '1px solid',
    borderRadius: '6px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  resultBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  badge: {
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  resultSummary: {
    fontSize: '12px',
    color: '#a1a1aa',
  },
  hashCompareRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
  },
  subLabel: {
    color: '#71717a',
  },
  codeHash: {
    color: '#ff2dab',
    fontWeight: 600,
  },
};
