import React, { useEffect, useRef, useState } from 'react';
import { Engine, replay } from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';
import { SimClient, SimStateUpdate } from '../simClient.js';
import { useLenisScrollRoot } from '../hooks/useLenisScrollRoot.js';
import '../aar/aar.css';

function SplitTitle({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} className="vj-char-mask">
          <span
            className="vj-split-char"
            style={{ '--char-index': i } as React.CSSProperties}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        </span>
      ))}
    </>
  );
}

function RevealWords({
  text,
  accentWords = [],
  baseIndex = 0,
}: {
  text: string;
  accentWords?: string[];
  baseIndex?: number;
}) {
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, wordIdx) => {
        if (/^\s+$/.test(part)) {
          return part;
        }
        const cleanWord = part.replace(/[.,;—–]/g, '');
        const isAccent = accentWords.includes(cleanWord);
        return (
          <span key={wordIdx} className="vj-word-mask">
            <span
              className={`vj-reveal-word${isAccent ? ' is-accent' : ''}`}
              style={{ '--word-index': baseIndex + wordIdx } as React.CSSProperties}
            >
              {part}
            </span>
          </span>
        );
      })}
    </>
  );
}

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
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  useLenisScrollRoot(scrollRootRef);

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
    <div
      ref={scrollRootRef}
      data-scroll-root=""
      style={{
        ...styles.container,
        backgroundImage: 'url(/textures/fine-grain.png)',
      }}
    >
      <div data-lenis-content="" style={styles.contentWrapper}>
        {/* 8-Column Stair Transition */}
        <div className="vj-stair-transition" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="vj-stair-panel"
              style={{ '--stair-index': i } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Top Editorial Navigation Bar */}
        <header style={styles.navBar}>
          <a href="#/" style={styles.brandLink}>
            <img
              src="/vajra-emblem.png"
              alt=""
              style={{ width: 24, height: 26 }}
            />{' '}
            VAJRA / SYSTEM CHECK
          </a>
          <a href="#/" style={styles.returnLink}>
            <TextRoll center stagger={0.015}>
              RETURN TO CONSOLE ↗
            </TextRoll>
          </a>
        </header>

        {/* Hero Header */}
        <div style={styles.eyebrow}>
          PHASE 0 · DETERMINISTIC CORE // ENGINE DIAGNOSTICS
        </div>
        <h1 style={styles.heroTitle}>
          <SplitTitle text="System check" />
        </h1>
        <p style={styles.heroSubtitle}>
          <RevealWords
            text="Deterministic simulation clock, FNV-1a 64-bit state digest, bit-parity replay verification, and snapshot round-trip diagnostics. Training simulation — generic open-source parameters only."
            accentWords={['Deterministic', 'FNV-1a', 'bit-parity', 'snapshot']}
          />
        </p>

        {/* Live Metrics Grid */}
        <section style={styles.metricsGrid}>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.metricCard, '--card-index': 0 } as React.CSSProperties}
          >
            <div style={styles.metricLabel}>TICK</div>
            <div style={styles.metricValue}>{simState.tick.toLocaleString()}</div>
            <div style={styles.metricCaption}>Simulation ticks</div>
          </div>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.metricCard, '--card-index': 1 } as React.CSSProperties}
          >
            <div style={styles.metricLabel}>STATE HASH</div>
            <div style={{ ...styles.metricValue, ...styles.monoHash }}>
              {simState.hash || 'COMPUTING...'}
            </div>
            <div style={styles.metricCaption}>FNV-1a 64-bit digest</div>
          </div>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.metricCard, '--card-index': 2 } as React.CSSProperties}
          >
            <div style={styles.metricLabel}>ENTITIES</div>
            <div style={styles.metricValue}>{simState.entityCount}</div>
            <div style={styles.metricCaption}>Active tracked contacts</div>
          </div>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.metricCard, '--card-index': 3 } as React.CSSProperties}
          >
            <div style={styles.metricLabel}>THROUGHPUT</div>
            <div style={styles.metricValue}>{tps}</div>
            <div style={styles.metricCaption}>Worker throughput</div>
          </div>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.metricCard, '--card-index': 4 } as React.CSSProperties}
          >
            <div style={styles.metricLabel}>RUN STATE</div>
            <div
              style={{
                ...styles.metricValue,
                color: simState.isRunning ? '#4e660e' : '#a83322',
              }}
            >
              <span
                className="vj-status-dot"
                style={{
                  backgroundColor: simState.isRunning ? '#4e660e' : '#a83322',
                }}
              />
              {simState.isRunning ? 'RUNNING' : 'PAUSED'}
            </div>
            <div style={styles.metricCaption}>Engine loop state</div>
          </div>
        </section>

        {/* Controls Section */}
        <section
          className="aar-card vj-card-cascade"
          style={{ ...styles.controlPanel, '--card-index': 5 } as React.CSSProperties}
        >
          <div style={styles.seedRow}>
            <input
              id="seedInput"
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              style={styles.input}
            />
            <button onClick={handleReset} style={styles.buttonSecondary}>
              <TextRoll center stagger={0.02}>
                Reset With Seed
              </TextRoll>
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
              <TextRoll center stagger={0.02}>
                Start
              </TextRoll>
            </button>
            <button
              onClick={handlePause}
              disabled={!simState.isRunning}
              style={{
                ...styles.buttonSecondary,
                opacity: !simState.isRunning ? 0.5 : 1,
              }}
            >
              <TextRoll center stagger={0.02}>
                Pause
              </TextRoll>
            </button>
            <button onClick={handleSpawnEntity} style={styles.buttonAction}>
              <TextRoll center stagger={0.02}>
                Spawn Test Entity
              </TextRoll>
            </button>
          </div>
        </section>

        {/* Verification Checks */}
        <section style={styles.verificationSection}>
          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.verifyCard, '--card-index': 6 } as React.CSSProperties}
          >
            <div style={styles.verifyHeaderRow}>
              <div>
                <h3 style={styles.verifyTitle}>Replay Verification</h3>
              </div>
              <button
                id="btn-verify-replay"
                onClick={handleVerifyReplay}
                style={styles.buttonVerify}
              >
                <TextRoll center stagger={0.02}>
                  Verify Replay
                </TextRoll>
              </button>
            </div>
            {replayResult.status !== 'IDLE' && (
              <div
                style={{
                  ...styles.resultBox,
                  borderColor:
                    replayResult.status === 'PASS'
                      ? 'rgba(78, 102, 14, 0.45)'
                      : 'rgba(184, 51, 39, 0.45)',
                }}
              >
                <div style={styles.resultBadgeRow}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor:
                        replayResult.status === 'PASS' ? '#4e660e' : '#a83322',
                    }}
                  >
                    {replayResult.status}
                  </span>
                </div>
                <div style={styles.hashCompareRow}>
                  <div>
                    <span style={styles.subLabel}>Live: </span>
                    <code style={styles.codeHash}>{replayResult.liveHash}</code>
                  </div>
                  <div>
                    <span style={styles.subLabel}>Replay: </span>
                    <code style={styles.codeHash}>{replayResult.replayHash}</code>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="aar-card vj-card-cascade"
            style={{ ...styles.verifyCard, '--card-index': 7 } as React.CSSProperties}
          >
            <div style={styles.verifyHeaderRow}>
              <div>
                <h3 style={styles.verifyTitle}>Snapshot & Restore</h3>
              </div>
              <button
                id="btn-verify-snapshot"
                onClick={handleVerifySnapshot}
                style={styles.buttonVerify}
              >
                <TextRoll center stagger={0.02}>
                  Verify Snapshot
                </TextRoll>
              </button>
            </div>
            {snapshotResult.status !== 'IDLE' && (
              <div
                style={{
                  ...styles.resultBox,
                  borderColor:
                    snapshotResult.status === 'PASS'
                      ? 'rgba(78, 102, 14, 0.45)'
                      : 'rgba(184, 51, 39, 0.45)',
                }}
              >
                <div style={styles.resultBadgeRow}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor:
                        snapshotResult.status === 'PASS' ? '#4e660e' : '#a83322',
                    }}
                  >
                    {snapshotResult.status}
                  </span>
                </div>
                <div style={styles.hashCompareRow}>
                  <div>
                    <span style={styles.subLabel}>Baseline: </span>
                    <code style={styles.codeHash}>
                      {snapshotResult.baselineHash}
                    </code>
                  </div>
                  <div>
                    <span style={styles.subLabel}>Restored: </span>
                    <code style={styles.codeHash}>
                      {snapshotResult.restoredHash}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#ded7ca',
    color: '#181716',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  contentWrapper: {
    maxWidth: '1240px',
    margin: '0 auto',
    padding: '28px clamp(20px, 4vw, 64px) 72px',
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '18px',
    borderBottom: '1px solid rgba(24, 23, 22, 0.18)',
  },
  brandLink: {
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.16em',
    color: '#181716',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  returnLink: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    color: '#181716',
    textDecoration: 'none',
  },
  eyebrow: {
    color: '#a83322',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.2em',
    marginTop: '32px',
  },
  heroTitle: {
    fontSize: 'clamp(38px, 5.5vw, 68px)',
    fontWeight: 800,
    letterSpacing: '-0.055em',
    lineHeight: 0.96,
    color: '#181716',
    margin: '8px 0 12px',
  },
  heroSubtitle: {
    color: '#58544e',
    fontSize: '14px',
    maxWidth: '720px',
    lineHeight: 1.6,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '14px',
    margin: '28px 0 22px',
  },
  metricCard: {
    backgroundColor: 'rgba(239, 235, 226, 0.9)',
    border: '1px solid rgba(45, 40, 35, 0.17)',
    borderRadius: '8px',
    padding: '18px 20px',
    boxShadow: '0 10px 28px rgba(45, 40, 35, 0.05)',
  },
  metricLabel: {
    color: '#726c62',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#181716',
    fontSize: '30px',
    fontWeight: 800,
    letterSpacing: '-0.04em',
    marginTop: '8px',
  },
  monoHash: {
    fontSize: '18px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#a83322',
  },
  metricCaption: {
    fontSize: '11px',
    color: '#767065',
    marginTop: '4px',
  },
  controlPanel: {
    backgroundColor: 'rgba(239, 235, 226, 0.9)',
    border: '1px solid rgba(45, 40, 35, 0.17)',
    borderRadius: '8px',
    padding: '22px 24px',
  },
  seedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  input: {
    backgroundColor: '#e4ded2',
    border: '1px solid rgba(45, 40, 35, 0.24)',
    color: '#181716',
    padding: '10px 14px',
    borderRadius: '5px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '13px',
    fontWeight: 600,
    flex: 1,
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
  },
  buttonPrimary: {
    backgroundColor: '#181716',
    color: '#f4eee3',
    border: '1px solid #181716',
    borderRadius: '5px',
    padding: '10px 20px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    color: '#181716',
    border: '1px solid rgba(45, 40, 35, 0.22)',
    borderRadius: '5px',
    padding: '10px 18px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  buttonAction: {
    backgroundColor: 'rgba(168, 51, 34, 0.1)',
    color: '#a83322',
    border: '1px solid rgba(168, 51, 34, 0.32)',
    borderRadius: '5px',
    padding: '10px 18px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  verificationSection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
    marginTop: '28px',
  },
  verifyCard: {
    backgroundColor: 'rgba(239, 235, 226, 0.9)',
    border: '1px solid rgba(45, 40, 35, 0.17)',
    borderRadius: '8px',
    padding: '22px 24px',
  },
  verifyHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    gap: '16px',
    marginBottom: '16px',
  },
  verifyTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: '#181716',
    letterSpacing: '0.05em',
  },
  buttonVerify: {
    backgroundColor: '#a83322',
    color: '#fff4ec',
    border: 'none',
    borderRadius: '5px',
    padding: '10px 18px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  resultBox: {
    backgroundColor: '#e4ded2',
    border: '1px solid',
    borderRadius: '5px',
    padding: '14px',
  },
  badge: {
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  hashCompareRow: {
    marginTop: '12px',
    fontSize: '12px',
    fontFamily: 'ui-monospace, monospace',
  },
  subLabel: {
    color: '#767065',
    fontWeight: 600,
  },
  codeHash: {
    color: '#181716',
    fontWeight: 700,
  },
};
