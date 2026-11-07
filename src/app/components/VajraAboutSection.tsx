import React, { useEffect, useRef } from 'react';

/**
 * VAJRA "What is VAJRA?" scroll-story section.
 * The scroll engine writes a smoothed progress value to each scene without React re-renders.
 */

const MANIFESTO =
  'VAJRA is a *deterministic* *counter-drone* training simulator. It puts operators behind a live air-defence console — radar, RF direction-finding and EO/IR — and asks one question, over and over: is that contact a *threat,* and what will you do about it?';

const TRAINING_STEPS = [
  { index: '01', tag: 'DETECT', summary: 'Acknowledge radar tracks' },
  { index: '02', tag: 'CLASSIFY', summary: 'Compare sensor cues' },
  { index: '03', tag: 'DECIDE', summary: 'Choose a measured response' },
  { index: '04', tag: 'DEBRIEF', summary: 'Review decisions and timing' },
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function useScrollEngine(rootRef: React.RefObject<HTMLDivElement>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scroller = root.closest<HTMLElement>('[data-scroll-root]');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const ease = reduceMotion ? 1 : 0.085;
    const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-scene]'));
    const current = scenes.map(() => 0);
    let rafId = 0;
    let lastViewH = -1;

    const frame = () => {
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewH = scroller ? scroller.clientHeight : window.innerHeight;
      if (viewH !== lastViewH) {
        lastViewH = viewH;
        root.style.setProperty('--vh', `${viewH}px`);
      }

      scenes.forEach((scene, i) => {
        const rect = scene.getBoundingClientRect();
        const top = rect.top - viewTop;
        const target = scene.dataset.scene === 'pin'
          ? clamp01(-top / Math.max(1, rect.height - viewH))
          : clamp01((viewH - top) / (viewH + rect.height * 0.5));
        const prev = current[i] ?? 0;
        const next = prev + (target - prev) * ease;
        const settled = Math.abs(target - next) < 0.0005 ? target : next;
        if (settled !== prev || prev === 0) {
          current[i] = settled;
          scene.style.setProperty('--p', settled.toFixed(4));
        }
      });

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [rootRef]);
}

function renderManifesto(): React.ReactNode[] {
  const phrases = [
    'VAJRA is a *deterministic* *counter-drone* training simulator.',
    'It puts operators behind a live air-defence console —',
    'radar, RF direction-finding and EO/IR —',
    'and asks one question, over and over:',
    'is that contact a *threat,* and what will you do about it?',
  ];
  let wordGlobalIndex = 0;
  const totalWords = MANIFESTO.split(' ').length;

  return phrases.map((phrase, lineIdx) => {
    const lineElements = phrase.split(' ').map((raw) => {
      const isAccent = raw.startsWith('*');
      const idx = wordGlobalIndex++;
      return (
        <span
          key={idx}
          className={`vj-word${isAccent ? ' vj-word-accent' : ''}`}
          style={{ '--i': idx, '--n': totalWords } as React.CSSProperties}
        >
          {raw.replace(/\*/g, '')}{' '}
        </span>
      );
    });

    return (
      <span
        key={lineIdx}
        className="vj-manifesto-line"
        style={{ '--l': lineIdx, '--line-count': phrases.length } as React.CSSProperties}
      >
        <span className="vj-manifesto-line-inner">{lineElements}</span>
      </span>
    );
  });
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
            <div className="vj-eyebrow">02 // WHAT IS VAJRA</div>
            <p className="vj-manifesto-text">{renderManifesto()}</p>
          </div>
        </div>
      </section>

      {/* SCENE 2 — Compact training loop marquee */}
      <section className="vj-training-strip" aria-label="How VAJRA trains operators">
        <div className="vj-training-strip-head">
          <span className="vj-eyebrow">03 // HOW IT TRAINS</span>
          <span className="vj-training-strip-note">FOUR REFLEXES · ONE CONSOLE</span>
        </div>
        <div className="vj-training-marquee" role="region" aria-label="Training sequence">
          <div className="vj-training-marquee-track">
            {[0, 1].map((copy) => (
              <div className="vj-training-marquee-group" key={copy} aria-hidden={copy === 1}>
                {TRAINING_STEPS.map((step) => (
                  <div className="vj-training-marquee-item" key={step.index}>
                    <span className="vj-training-marquee-index">{step.index}</span>
                    <strong>{step.tag}</strong>
                    <span>{step.summary}</span>
                    <span className="vj-training-marquee-arrow" aria-hidden="true">↗</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCENE 3 — Mission Launch & Operations Manual (Complete Operator Guide) */}
      <section className="vj-scene vj-guide-section">
        <div className="vj-guide-container">
          <div className="vj-guide-header">
            <div className="vj-guide-header-copy">
              <div className="vj-eyebrow">04 // OPERATOR FLIGHT MANUAL</div>
              <h2 className="vj-guide-headline">How to Run a Mission in VAJRA</h2>
              <p className="vj-guide-subhead">
                Step-by-step operating guide from mission configuration to console engagement and post-action debriefing.
              </p>
            </div>
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
                <li><b>Multi-Threat Tactical Airspace:</b> High-density 13-target sector mixing FPVs, fiber drones, recon UAV, decoy lures, civilian quads, and birds.</li>
                <li><b>Dawn Intrusion / Ridge Runner / City Edge Night:</b> Focused rural, terrain-masked fog, and heavy urban EW drills.</li>
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
                When the mission starts, the 20 Hz Pulse-Doppler radar sweeps across your sector. Every object enters as an Unknown Bogey until you analyze its telemetry:
              </p>
              <ul className="vj-guide-list">
                <li><b>Radar PPI Scope:</b> Displays range rings (500m, 1km, 1.5km, 3km, 6km), antenna sweep, RF bearing strobes, and moving tracks with fading trails.</li>
                <li><b>Track Selection:</b> Click any track on the scope or track table, or press <kbd>Tab</kbd> to cycle targets and <kbd>N</kbd> for unclassified targets.</li>
                <li><b>Acknowledge Contact:</b> Press <kbd>A</kbd> (or <kbd>Shift+A</kbd> to ack all) under 3.0s latency to log prompt radar detection.</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Clutter & Decoy Bait:</b> Urban EW spawns false blips, while low-altitude medium-RCS silent tracks are fake decoy lures designed to drain your gun magazine.
              </div>
            </div>

            {/* Step 3 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 03</div>
              <h3 className="vj-guide-title">EO/IR Turret & Threat Classification</h3>
              <p className="vj-guide-desc">
                Inspect ambiguous tracks visually using the progressive TADS/FLIR targeting camera in the right panel:
              </p>
              <ul className="vj-guide-list">
                <li><b>Lock & Optical Zoom:</b> Press <kbd>E</kbd> to slew the EO/IR turret onto the selected track and step through <b>1.0X / 2.5X / 5.0X</b> zoom to resolve airframe silhouettes.</li>
                <li><b>Thermal / Daylight Palettes:</b> Press <kbd>T</kbd> or select <b>WHOT / BHOT / NVG / TV</b> modes alongside closing rate, altitude, RCS, and RF strobes.</li>
                <li><b>Assign Classification:</b> Press <kbd>1</kbd> Bird, <kbd>2</kbd> Civilian Quad, <kbd>3</kbd> FPV Strike, <kbd>4</kbd> Fixed-Wing Recon, <kbd>5</kbd> Clutter, <kbd>6</kbd> Fiber FPV, <kbd>7</kbd> Decoy, or <kbd>0</kbd> Unknown.</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Hold Fire Discipline:</b> Never shoot or jam Civilian Quads, Birds, Clutter, or Fake Decoys — press <kbd>H</kbd> to issue Hold Fire and avoid ROE / bait penalties.
              </div>
            </div>

            {/* Step 4 */}
            <div className="vj-guide-card">
              <div className="vj-guide-num">STEP 04</div>
              <h3 className="vj-guide-title">Effector Engagement & Scoring</h3>
              <p className="vj-guide-desc">
                Once a confirmed threat enters weapon range, pair the right countermeasure before asset impact:
              </p>
              <ul className="vj-guide-list">
                <li><b>RF Directional Jammer (Soft Kill):</b> Effective up to <b>1,500 m</b> (&gt;800 m). Press <kbd>J</kbd> to disrupt wireless links. Useless against Fiber FPVs and drones inside <b>&lt;800 m</b> autonomous optical lock!</li>
                <li><b>30mm CIWS Auto-Gun (Hard Kill):</b> Effective up to <b>1,000 m</b>. Press <kbd>G</kbd> to fire a kinetic burst (20 bursts max) — save ammo for Fiber FPVs and close-in leakers.</li>
                <li><b>Time Compression:</b> Press <kbd>Space</kbd> to pause or <kbd>+</kbd> / <kbd>-</kbd> to adjust simulation speed (<b>1x, 2x, 4x</b>).</li>
              </ul>
              <div className="vj-guide-tip">
                <b>Scoring & Replay:</b> Missions score out of 100 across 5 doctrine dimensions and unlock a tick-by-tick After-Action Replay showing every shot, jam, or decoy mistake.
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
              <div><kbd>+/-</kbd> Speed (1x/2x/4x)</div>
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
              <a href="#/commander" className="vj-grand-link">Commander C2</a>
              <a href="#/aar" className="vj-grand-link">AAR Archive</a>
              <a href="#/contacts/fpv_kamikaze" className="vj-grand-link">Threat Intel</a>
              <a href="#/check" className="vj-grand-link">System Diagnostics</a>
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
              <span>7 Airframe Classes</span>
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
