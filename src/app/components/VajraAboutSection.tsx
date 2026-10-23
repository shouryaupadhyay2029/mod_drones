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
  visual: 'detect' | 'classify' | 'decide' | 'debrief';
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
    visual: 'debrief',
  },
];

const STATS: Array<{ to: number; suffix: string; label: string }> = [
  { to: 20, suffix: ' Hz', label: 'Fixed-step simulation' },
  { to: 4, suffix: '', label: 'Difficulty tiers' },
  { to: 8, suffix: '', label: 'Threat & clutter classes' },
  { to: 100, suffix: '%', label: 'Deterministic replay' },
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

function PillarVisual({ kind }: { kind: Pillar['visual'] }): React.JSX.Element {
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
  if (kind === 'decide') {
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
  const bars = Array.from({ length: 36 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));
  return (
    <div className="vj-debrief">
      <div className="vj-debrief-head">
        <span>SEED</span>
        <b>c8f5ec92</b>
        <span className="vj-debrief-ok">HASH MATCH ✓</span>
      </div>
      <div className="vj-debrief-bars">
        {bars.map((h, i) => (
          <i key={i} style={{ '--h': h, '--k': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="vj-debrief-rows">
        <div><span>DETECTION</span><b>96</b></div>
        <div><span>CLASSIFICATION</span><b>88</b></div>
        <div><span>DECISION</span><b>91</b></div>
      </div>
    </div>
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
                <div className="vj-panel-visual">
                  <div className="vj-visual-chrome">
                    <span>VAJRA // {p.tag}</span>
                    <span className="vj-live">
                      <i /> LIVE
                    </span>
                  </div>
                  <div className="vj-visual-body">
                    <PillarVisual kind={p.visual} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SCENE 3 — Mission loop count-up stats */}
      <section className="vj-scene vj-loop" data-scene="pin" data-counters="">
        <div className="vj-sticky">
          <div className="vj-loop-inner">
            <div className="vj-eyebrow">
              04 // THE MISSION LOOP
            </div>
            <h2 className="vj-loop-title">
              From first plot to final verdict in <em>under five minutes.</em>
            </h2>

            <div className="vj-stats">
              {STATS.map((s) => (
                <div key={s.label} className="vj-stat">
                  <div className="vj-stat-value">
                    <span data-count-to={s.to}>0</span>
                    <small>{s.suffix}</small>
                  </div>
                  <div className="vj-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SCENE 4 — Closing call to action */}
      <section className="vj-scene vj-cta" data-scene="enter">
        <div className="vj-cta-inner">
          <div className="vj-eyebrow">
            05 // READY ROOM
          </div>
          <h2 className="vj-cta-title">
            <span className="vj-line"><span>Train the reflex</span></span>
            <span className="vj-line"><span><em>before</em> the threat arrives.</span></span>
          </h2>
          <div className="vj-cta-actions">
            <button type="button" className="vj-cta-btn" onClick={openBriefing}>
              <span>LAUNCH MISSION</span>
              <i>→</i>
            </button>
            <a href="#/check" className="vj-cta-link">
              Run system diagnostics ↗
            </a>
          </div>
        </div>
        <footer className="vj-footer">
          <span>VAJRA</span>
          <span>Counter-UAS training simulator · Deterministic build</span>
          <span>All scenarios fictional · No real units or insignia</span>
        </footer>
      </section>
    </div>
  );
}
