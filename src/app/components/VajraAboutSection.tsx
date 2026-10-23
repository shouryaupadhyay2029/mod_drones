import React, { useEffect, useRef } from 'react';

/**
 * VAJRA "What is VAJRA?" scroll-story section.
 *
 * A lightweight, dependency-free scroll engine drives every animation:
 *  - Each scene declares data-scene="pin" (sticky, progress across its scroll length)
 *    or data-scene="enter" (progress while it travels through the viewport).
 *  - Progress is lerped every animation frame for an inertial, buttery feel and written
 *    to the scene as the CSS variable --p (0..1). No React re-renders on scroll.
 */

const MANIFESTO =
  'VAJRA is a *deterministic* *counter-drone* training simulator. It puts operators behind a live air-defence console — radar, RF direction-finding and EO/IR — and asks one question, over and over: is that contact a *threat,* and what will you do about it?';

interface Pillar {
  index: string;
  tag: string;
  title: string;
  body: string;
  metrics: Array<[string, string]>;
  visual?: 'detect' | 'classify' | 'decide';
}

const PILLARS: Pillar[] = [
  {
    index: '01',
    tag: 'DETECT',
    title: 'See what the sky is hiding.',
    body: 'A 20 Hz pulse-Doppler radar, passive RF direction-finding and a slewable EO/IR turret. Terrain masks low flyers, clutter breeds ghost plots, and small targets fade in and out of the noise floor.',
    metrics: [
      ['SCAN RATE', '20 Hz'],
      ['SENSORS', 'RADAR · RF · EO/IR'],
    ],
    visual: 'detect',
  },
  {
    index: '02',
    tag: 'CLASSIFY',
    title: 'Separate the bird from the bomb.',
    body: 'Speed, RCS bucket, turn rate, RF signature and optical cues — nothing is labelled for you. FPV strike drones, fibre-guided FPVs, decoys, civilian quads and birds all look alike at 4 km.',
    metrics: [
      ['THREAT CLASSES', '8'],
      ['GROUND TRUTH', 'HIDDEN'],
    ],
    visual: 'classify',
  },
  {
    index: '03',
    tag: 'DECIDE',
    title: 'Choose the right effector, in time.',
    body: 'A 1.5 km directional RF jammer for soft kills and a 1 km 30 mm gun with finite ammunition for hard kills. Hold fire on neutrals. Every wasted burst and every leaker is scored.',
    metrics: [
      ['SOFT KILL', '1,500 m'],
      ['HARD KILL', '1,000 m'],
    ],
    visual: 'decide',
  },
  {
    index: '04',
    tag: 'DEBRIEF',
    title: 'Replay every second, bit for bit.',
    body: 'A seeded, fixed-step physics core reproduces any mission exactly. Per-contact scoring explains detection, classification and decision latency — share a seed and a colleague faces the same sky.',
    metrics: [
      ['REPLAY', 'BIT-EXACT'],
      ['SCORING', 'PER CONTACT'],
    ],
  },
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useScrollEngine(rootRef: React.RefObject<HTMLDivElement>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scroller = root.closest<HTMLElement>('[data-scroll-root]');
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ease = reduceMotion ? 1 : 0.085;

    const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-scene]'));
    const current = scenes.map(() => 0);

    const track = root.querySelector<HTMLElement>('[data-hscroll-track]');
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count-to]'));
    const lastCount = counters.map(() => -1);

    let rafId = 0;
    let lastViewH = -1;

    const frame = () => {
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewH = scroller ? scroller.clientHeight : window.innerHeight;
      const viewW = scroller ? scroller.clientWidth : window.innerWidth;
      if (viewH !== lastViewH) {
        lastViewH = viewH;
        root.style.setProperty('--vh', `${viewH}px`);
      }

      scenes.forEach((scene, i) => {
        const rect = scene.getBoundingClientRect();
        const top = rect.top - viewTop;
        let target: number;
        if (scene.dataset.scene === 'pin') {
          const scrollable = Math.max(1, rect.height - viewH);
          target = clamp01(-top / scrollable);
        } else {
          target = clamp01((viewH - top) / (viewH + rect.height * 0.5));
        }
        const prev = current[i] ?? 0;
        const next = prev + (target - prev) * ease;
        const settled = Math.abs(target - next) < 0.0005 ? target : next;
        if (settled !== prev || prev === 0) {
          current[i] = settled;
          scene.style.setProperty('--p', settled.toFixed(4));
        }

        // Horizontal pillar track
        if (scene.dataset.hscroll !== undefined && track) {
          const distance = Math.max(0, track.scrollWidth - viewW);
          track.style.transform = `translate3d(${(-distance * settled).toFixed(2)}px, 0, 0)`;
          const center = viewW / 2;
          panels.forEach((panel) => {
            const r = panel.getBoundingClientRect();
            const d = (r.left + r.width / 2 - center) / viewW;
            const a = Math.min(1, Math.abs(d) * 1.6);
            panel.style.setProperty('--a', a.toFixed(3));
            panel.style.setProperty('--d', Math.max(-1, Math.min(1, d)).toFixed(3));
          });
        }

        // Count-up statistics
        if (scene.dataset.counters !== undefined) {
          const t = easeOutCubic(clamp01((settled - 0.35) / 0.45));
          counters.forEach((el, k) => {
            const to = Number(el.dataset.countTo || 0);
            const val = Math.round(to * t);
            if (val !== lastCount[k]) {
              lastCount[k] = val;
              el.textContent = String(val);
            }
          });
        }
      });

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [rootRef]);
}

function renderManifesto(): React.ReactNode[] {
  // Group words into semantic lines / rising phrases so each phrase slides up smoothly as a coherent unit
  const phrases = [
    { text: 'VAJRA is a *deterministic* *counter-drone* training simulator.', accentIdxs: [2, 3] },
    { text: 'It puts operators behind a live air-defence console —', accentIdxs: [] },
    { text: 'radar, RF direction-finding and EO/IR —', accentIdxs: [] },
    { text: 'and asks one question, over and over:', accentIdxs: [] },
    { text: 'is that contact a *threat,* and what will you do about it?', accentIdxs: [4] },
  ];

  let wordGlobalIndex = 0;
  const totalWords = MANIFESTO.split(' ').length;

  return phrases.map((phrase, lineIdx) => {
    const words = phrase.text.split(' ');
    const lineElements = words.map((raw) => {
      const isAccent = raw.startsWith('*');
      const cleanWord = raw.replace(/\*/g, '');
      const idx = wordGlobalIndex++;
      return (
        <span
          key={idx}
          className={`vj-word${isAccent ? ' vj-word-accent' : ''}`}
          style={{ '--i': idx, '--n': totalWords } as React.CSSProperties}
        >
          {cleanWord}{' '}
        </span>
      );
    });

    return (
      <span
        key={lineIdx}
        className="vj-manifesto-line"
        style={{ '--l': lineIdx, '--line-count': phrases.length } as React.CSSProperties}
      >
        <span className="vj-manifesto-line-inner">
          {lineElements}
        </span>
      </span>
    );
  });
}

function PillarVisual({ kind }: { kind: NonNullable<Pillar['visual']> }): React.JSX.Element {
  if (kind === 'detect') {
    return (
      <svg viewBox="0 0 240 240" className="vj-visual-svg">
        {[100, 75, 50, 25].map((r) => (
          <circle key={r} cx="120" cy="120" r={r} className="vj-v-ring" />
        ))}
        <line x1="20" y1="120" x2="220" y2="120" className="vj-v-axis" />
        <line x1="120" y1="20" x2="120" y2="220" className="vj-v-axis" />
        <g className="vj-v-sweep">
          <path d="M120 120 L120 20 A100 100 0 0 1 178 39 Z" className="vj-v-wedge" />
          <line x1="120" y1="120" x2="120" y2="20" className="vj-v-beam" />
        </g>
        <circle cx="168" cy="72" r="3.5" className="vj-v-blip vj-v-blip-hostile" />
        <circle cx="74" cy="92" r="3" className="vj-v-blip" style={{ animationDelay: '0.8s' }} />
        <circle cx="146" cy="170" r="2.5" className="vj-v-blip" style={{ animationDelay: '1.6s' }} />
        <circle cx="120" cy="120" r="4" className="vj-v-asset" />
      </svg>
    );
  }
  if (kind === 'classify') {
    const classes = ['FPV', 'FIBRE', 'DECOY', 'QUAD', 'UAV', 'BIRD', 'CLUTTER', 'UNKNOWN'];
    const cues: Array<[string, number]> = [
      ['SPEED', 0.82],
      ['RCS', 0.34],
      ['TURN', 0.18],
      ['RF', 0.9],
    ];
    return (
      <div className="vj-classify">
        <div className="vj-classify-grid">
          {classes.map((c, i) => (
            <span key={c} className={`vj-class-chip${i === 0 ? ' is-hit' : ''}`}>
              {c}
            </span>
          ))}
        </div>
        <div className="vj-cues">
          {cues.map(([label, v]) => (
            <div key={label} className="vj-cue-row">
              <span>{label}</span>
              <div className="vj-cue-bar">
                <i style={{ '--v': v } as React.CSSProperties} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // fallback default: radar
  return (
    <svg viewBox="0 0 240 240" className="vj-visual-svg">
      <circle cx="120" cy="140" r="92" className="vj-v-ring-jam" />
      <circle cx="120" cy="140" r="62" className="vj-v-ring-gun" />
      <text x="120" y="42" className="vj-v-label vj-v-label-jam">JAM 1.5 KM</text>
      <text x="120" y="72" className="vj-v-label vj-v-label-gun">GUN 1.0 KM</text>
      <path d="M228 18 C 190 60, 170 90, 150 118" className="vj-v-track" />
      <circle cx="150" cy="118" r="4" className="vj-v-blip-hostile vj-v-target" />
      <path d="M144 112 h-6 v6 M156 112 h6 v6 M144 124 h-6 v-6 M156 124 h6 v-6" className="vj-v-reticle" />
      <circle cx="120" cy="140" r="5" className="vj-v-asset" />
    </svg>
  );
}

export function VajraAboutSection(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollEngine(rootRef);

  const openBriefing = () => {
    window.dispatchEvent(new CustomEvent('mod:open-briefing'));
  };

  return (
    <div className="vj-about" ref={rootRef}>
      {/* SCENE 1 — Manifesto: word-by-word reveal while pinned */}
      <section className="vj-scene vj-manifesto" data-scene="pin">
        <div className="vj-sticky">
          <div className="vj-manifesto-inner">
            <div className="vj-eyebrow">
              02 // WHAT IS VAJRA
            </div>
            <p className="vj-manifesto-text">{renderManifesto()}</p>
          </div>
        </div>
      </section>

      {/* SCENE 2 — Four pillars: vertical scroll drives a horizontal track */}
      <section className="vj-scene vj-pillars" data-scene="pin" data-hscroll="">
        <div className="vj-sticky vj-sticky-clip">
          <div className="vj-pillars-head">
            <span className="vj-eyebrow">
              03 // HOW IT TRAINS
            </span>
            <div className="vj-pillars-counter">
              {PILLARS.map((p, i) => (
                <span key={p.tag} style={{ '--k': i } as React.CSSProperties}>
                  {p.tag}
                </span>
              ))}
            </div>
          </div>

          <div className="vj-track" data-hscroll-track="">
            <div className="vj-panel vj-panel-intro" data-panel="">
              <h2 className="vj-intro-title">
                Four reflexes.
                <br />
                <em>One console.</em>
              </h2>
              <p className="vj-intro-sub">
                Every mission rehearses the same kill chain an air-defence operator runs under
                pressure — compressed into minutes, scored to the second.
              </p>
              <div className="vj-intro-hint">
                <span>SCROLL</span>
                <i />
              </div>
            </div>

            {PILLARS.map((p) => (
              <article key={p.index} className="vj-panel" data-panel="">
                <div className="vj-panel-text">
                  <div className="vj-panel-index">
                    <span>{p.index}</span>
                    <span className="vj-panel-tag">{p.tag}</span>
                  </div>
                  <h3 className="vj-panel-title">{p.title}</h3>
                  <p className="vj-panel-body">{p.body}</p>
                  <div className="vj-panel-metrics">
                    {p.metrics.map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                  </div>
                </div>
                {p.visual && (
                  <div className="vj-panel-visual">
                    <div className="vj-visual-body">
                      <PillarVisual kind={p.visual} />
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SCENE 3 — Mission Launch & Operations Manual (Complete Operator Guide) */}
      <section className="vj-scene vj-guide-section">
        <div className="vj-guide-container">
          <div className="vj-guide-header">
            <div className="vj-eyebrow">04 // OPERATOR FLIGHT MANUAL</div>
            <h2 className="vj-guide-headline">How to Run a Mission in VAJRA</h2>
            <p className="vj-guide-subhead">
              Step-by-step operating guide from mission configuration to console engagement and post-action debriefing.
            </p>
          </div>

          <div className="vj-guide-grid">
            {/* Step 1 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 01</div>
              <h3 className="vj-guide-title">Pre-Flight & Scenario Setup</h3>
              <p className="vj-guide-desc">
                Click <b>LAUNCH MISSION</b> in the top right to open the mission configuration modal. Choose between scripted training scenarios or procedural generation:
              </p>
              <ul className="vj-guide-list">
                <li><b>Dawn Intrusion:</b> Baseline rural scenario with clear weather and light avian clutter.</li>
                <li><b>Ridge Runner:</b> Low-altitude terrain masking in hilly fog with light EW jamming.</li>
                <li><b>City Edge Night:</b> Dense urban clutter, rain, reduced visibility and heavy EW spoofing.</li>
                <li><b>Procedural Swarm:</b> Dynamic generator across 4 difficulty tiers (Recruit, Operator, Veteran, Elite) with seeded jitter.</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Seed Determinism:</b> Enter any alphanumeric seed string (e.g. <code>s1</code>) or click <i>Randomize</i>. Sharing the exact seed allows peers to face the exact same physical trajectory.
              </div>
            </div>

            {/* Step 2 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 02</div>
              <h3 className="vj-guide-title">Console Radar & Track Table</h3>
              <p className="vj-guide-desc">
                When the mission starts, the 20 Hz Pulse-Doppler radar sweeps across your sector. Raw radar plots are fused into numbered track symbols:
              </p>
              <ul className="vj-guide-list">
                <li><b>Radar PPI Scope:</b> Displays range rings (500m, 1km, 1.5km, 3km, 5km), antenna heading, and moving target tracks with fading motion trails.</li>
                <li><b>Track Selection:</b> Click any track on the scope or track table, or press <kbd>Tab</kbd> to cycle targets and <kbd>N</kbd> for unclassified targets.</li>
                <li><b>Acknowledge Contact:</b> Press <kbd>A</kbd> (or <kbd>Shift+A</kbd> to ack all) to flag that you have detected and acknowledged incoming blips.</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Clutter & Ghosts:</b> High EW or city terrain spawns false radar blips. Watch velocity vectors and consistency before committing munitions.
              </div>
            </div>

            {/* Step 3 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 03</div>
              <h3 className="vj-guide-title">EO/IR Turret & Threat Classification</h3>
              <p className="vj-guide-desc">
                Inspect ambiguous tracks visually using the slewable electro-optical gimbal in the right panel:
              </p>
              <ul className="vj-guide-list">
                <li><b>Lock Slew Turret:</b> Press <kbd>E</kbd> to slave the EO/IR camera directly onto the selected track.</li>
                <li><b>Thermal / Daylight:</b> Press <kbd>T</kbd> to toggle between Daylight (TV) and Thermal Infrared (FLIR) optical sensors.</li>
                <li><b>Kinematic Cues:</b> Analyze speed, altitude, turn rate, RF signature, and RCS bucket to identify the threat.</li>
                <li><b>Assign Classification:</b> Press hotkeys <kbd>1</kbd> to <kbd>7</kbd> or <kbd>0</kbd> (FPV Strike, Fibre-guided, Decoy, Commercial Quad, Fixed-Wing UAV, Bird, Clutter, Neutral).</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Hold Fire:</b> If a track is classified as a bird or civilian neutral, press <kbd>H</kbd> to issue a Hold Fire directive to protect non-combatants.
              </div>
            </div>

            {/* Step 4 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 04</div>
              <h3 className="vj-guide-title">Effector Engagement & Scoring</h3>
              <p className="vj-guide-desc">
                Once a hostile target crosses into range, select the optimal neutralization effector before asset impact:
              </p>
              <ul className="vj-guide-list">
                <li><b>RF Directional Jammer (Soft Kill):</b> Effective up to <b>1,500 m</b>. Press <kbd>J</kbd> to jam standard wireless links and neutralize non-fibre drones.</li>
                <li><b>30mm CIWS Auto-Gun (Hard Kill):</b> Effective up to <b>1,000 m</b>. Press <kbd>G</kbd> to fire a kinetic burst. Ammunition is limited (20 bursts) — conserve ammo.</li>
                <li><b>Time Compression:</b> Press <kbd>Space</kbd> to pause or <kbd>+</kbd> / <kbd>-</kbd> to adjust simulation speed (1x, 2x, 5x, 10x).</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Scoring Breakdown:</b> Missions end upon threat resolution or asset breach. Your performance is scored out of 100 on detection speed, classification accuracy, effector choice, and asset integrity.
              </div>
            </div>
          </div>

          {/* Quick Key Reference Strip */}
          <div className="vj-guide-keys-strip">
            <span className="vj-guide-keys-label">KEYBOARD SHORTCUTS</span>
            <div className="vj-guide-keys-grid">
              <div><kbd>Tab</kbd> Next Track</div>
              <div><kbd>N</kbd> Next Unclassified</div>
              <div><kbd>A</kbd> Acknowledge</div>
              <div><kbd>Shift+A</kbd> Ack All</div>
              <div><kbd>1-7, 0</kbd> Classify Target</div>
              <div><kbd>E</kbd> Lock EO/IR Turret</div>
              <div><kbd>T</kbd> Toggle TV / IR</div>
              <div><kbd>J</kbd> Fire Jammer (1.5km)</div>
              <div><kbd>G</kbd> Fire 30mm Gun (1km)</div>
              <div><kbd>H</kbd> Hold Fire</div>
              <div><kbd>Space</kbd> Pause/Resume</div>
              <div><kbd>+/-</kbd> Change Speed</div>
            </div>
          </div>
        </div>
      </section>

      {/* SCENE 4 — Grand Editorial Typography Footer */}
      <footer className="vj-grand-footer">
        <div className="vj-grand-footer-inner">
          {/* Top meta row */}
          <div className="vj-grand-top-row">
            <div className="vj-grand-tagline">
              Deterministic Air-Defence & Counter-UAS Simulation Platform
            </div>
            <div className="vj-grand-top-links">
              <button type="button" onClick={openBriefing} className="vj-grand-link-btn">
                Launch Mission
              </button>
              <a href="#/check" className="vj-grand-link">System Diagnostics</a>
              <span className="vj-grand-link-disabled">Scenarios</span>
              <span className="vj-grand-link-disabled">Threat Intel</span>
              <span className="vj-grand-link-disabled">Documentation</span>
            </div>
          </div>

          {/* Massive Editorial Brand Wordmark */}
          <div className="vj-grand-brand-wrap" aria-label="VAJRA">
            <span className="vj-grand-brand-text">VAJRA</span>
          </div>

          {/* Sub-row links */}
          <div className="vj-grand-sub-row">
            <div className="vj-grand-sub-left">
              <span>Radar Telemetry</span>
              <span>RF Direction-Finding</span>
              <span>EO/IR Slew Gimbal</span>
              <span>Deterministic Core</span>
            </div>
            <div className="vj-grand-sub-right">
              <span>20 Hz Simulation</span>
              <span>4 Difficulty Tiers</span>
              <span>8 Threat Classes</span>
              <span>100% Bit-Exact Replay</span>
            </div>
          </div>

          {/* Bottom legal & disclaimer strip */}
          <div className="vj-grand-bottom-strip">
            <div className="vj-grand-bottom-left">
              <span>Simulation Platform</span>
              <span>Cryptographic Air-Gap</span>
              <span>TraineeView Isolation</span>
              <span>Zero Ground-Truth Leakage</span>
            </div>
            <div className="vj-grand-bottom-right">
              © {new Date().getFullYear()} VAJRA C-UAS Simulator. All scenarios fictional. No real units or insignia.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
