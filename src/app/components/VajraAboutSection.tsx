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
