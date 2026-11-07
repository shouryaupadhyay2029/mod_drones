import React, { useEffect, useRef, useState } from 'react';
import { THREAT_LIBRARY, ThreatClassId } from '../../sim/index.js';
import { BirdAsciiSimulation } from '../components/BirdAsciiSimulation.js';
import { CivilianQuadAsciiSimulation } from '../components/CivilianQuadAsciiSimulation.js';
import { FpvKamikazeAsciiSimulation } from '../components/FpvKamikazeAsciiSimulation.js';
import { FpvFiberAsciiSimulation } from '../components/FpvFiberAsciiSimulation.js';
import { FixedWingAsciiSimulation } from '../components/FixedWingAsciiSimulation.js';
import { DecoyDroneAsciiSimulation } from '../components/DecoyDroneAsciiSimulation.js';
import { useLenisScrollRoot } from '../hooks/useLenisScrollRoot.js';
import './contact-library.css';

export interface ContactReference {
  id: string;
  modelClass: ThreatClassId;
  label: string;
  category: string;
  summary: string;
  cues: string[];
  caveat: string;
}

export const CONTACT_REFERENCES: readonly ContactReference[] = [
  {
    id: 'bird',
    modelClass: 'bird',
    label: 'Avian Biological',
    category: 'Biological Contact (Non-Threat)',
    summary: 'Biological airborne contact. Micro-RCS return with fluctuating flap-and-drift motion and zero RF emissions.',
    cues: [
      'Motion Dynamics: Low velocity (4–14 m/s), low altitude (10–150m MSL), meandering heading with wind drift or thermal soaring.',
      'Radar & Doppler: Micro-RCS (~0.001 m²) with fluctuating track quality; micro-Doppler shows periodic wing-beat modulation.',
      'RF Spectrum: Zero RF emission across all civilian and military bands; no control uplink or video downlink.',
      'Effector Action: WEAPONS HOLD. RF Jammer is 0% effective; CIWS engagement expends ammunition and triggers doctrine penalty.',
    ],
    caveat: 'DO NOT ENGAGE. Confirm track stabilization over multiple sweeps. A weak return without RF can also mimic stealthy micro-drones; cross-reference speed (<15 m/s) and thermal profile (0.2) before ruling out threats.',
  },
  {
    id: 'commercial_quad',
    modelClass: 'commercial_quad',
    label: 'Civilian Quadcopter',
    category: 'Commercial Multirotor (Non-Hostile)',
    summary: 'Commercial rotary drone with active ISM telemetry. Non-hostile civilian transit; engaging with Jammer or Gun violates ROE (-25 pts, 60 score cap).',
    cues: [
      'Motion Dynamics: Moderate lateral speed (8–16 m/s), 40–120m MSL, perimeter transit or hovering without a high-speed attack dive.',
      'Radar & Doppler: Small RCS (~0.01 m²); multirotor return paired with low closing rate.',
      'RF Spectrum & FLIR: Continuous 2.4 GHz / 5.8 GHz civilian TELEMETRY link; FLIR shows symmetric X-frame with landing skids (no nose warhead).',
      'Effector Action: WEAPONS HOLD / HOLD FIRE [H]. Never engage with RF Jammer or Kinetic Gun — any effector discharge triggers a -25 pt ROE violation and hard-caps mission score at 60.',
    ],
    caveat: 'STRICT ROE PROTECTION. Any live effector engagement (kinetic or electronic) against a civilian quadcopter breaches Rules of Engagement. Classify as Civilian Quad [2] and issue Hold Fire [H].',
  },
  {
    id: 'fpv_kamikaze',
    modelClass: 'fpv_kamikaze',
    label: 'Radio-Linked FPV Strike Drone',
    category: 'Hostile Loitering Strike (Hostile)',
    summary: 'High-speed racing multirotor on a direct attack dive. Features active RF video, switching to autonomous optical lock at 800m.',
    cues: [
      'Motion Dynamics: High velocity (25–35 m/s / up to 126 km/h), low altitude (20–80m AGL), direct high-closing-rate attack vector straight toward defended asset.',
      'Radar & Doppler: Small RCS (~0.02 m²); steady Doppler return; rapid acceleration and sharp high-G terminal dive.',
      'RF Spectrum: Active analog/digital WIDEBAND VIDEO transmission (5.8 GHz) and RC uplink (868/915 MHz or 2.4 GHz).',
      'Effector Action: DUAL-PHASE DEFENSE. Soft-kill RF Jammer effective beyond 800m. At <800m, target activates optical terminal lock (RF immune) — instant Kinetic CIWS hard-kill mandatory!',
    ],
    caveat: 'PRIORITY HOSTILE TARGET. Jam immediately beyond 800m to disrupt pilot control. If track breaches 800m without neutralization, RF Jammer is 0% effective: engage with 30mm Kinetic CIWS immediately.',
  },
  {
    id: 'fpv_fiber',
    modelClass: 'fpv_fiber',
    label: 'Fiber-Optic Guided FPV Drone',
    category: 'RF-Silent Guided Strike (Hostile)',
    summary: 'Micro-fiber tethered strike drone. Zero RF signature and 100% immune to electronic warfare jamming; requires kinetic hard-kill.',
    cues: [
      'Motion Dynamics: High velocity (20–30 m/s), low altitude (20–80m AGL), terrain-hugging linear ingress tethered by spooled glass fiber.',
      'Radar & Doppler: Small RCS (~0.02 m²); consistent multirotor Doppler return without corresponding RF emitter.',
      'RF Spectrum: COMPLETE RF SILENCE. Zero radio emissions across entire spectrum; invisible to spectrum direction finders.',
      'Effector Action: HARD-KILL ONLY. Directional RF Jammer is 0% effective at all ranges. Kinetic CIWS gun engagement is the only viable countermeasure.',
    ],
    caveat: 'EW IMMUNE THREAT. Do not waste jammer duty cycles or operator time attempting soft-kill. Designate as priority target for Kinetic CIWS airburst intercept immediately upon radar detection.',
  },
  {
    id: 'fixed_wing_recon',
    modelClass: 'fixed_wing_recon',
    label: 'Fixed-Wing Reconnaissance UAV',
    category: 'Hostile Surveillance UAV (Hostile)',
    summary: 'Standoff surveillance drone. Maintains constant forward airspeed and medium-altitude orbits while relaying targeting data.',
    cues: [
      'Motion Dynamics: Continuous forward airspeed (22–32 m/s), medium altitude (150–400m MSL), wide banking turns or fixed racetrack orbits.',
      'Radar & Doppler: Medium RCS (~0.05 m²); continuous unbroken radar track; single-pusher propeller Doppler modulation.',
      'RF Spectrum: Encrypted long-range telemetry link and digital downlink; occasional burst transmissions.',
      'Effector Action: INTERCEPT BEFORE COORDINATE HANDOFF. Soft-kill RF Jammer effective within 1.5 km range. Kinetic CIWS hard-kill when closing within range.',
    ],
    caveat: 'STANDOFF THREAT. Fixed-wing drones spot assets and direct artillery/missiles from outside close-defense perimeters. Track heading: if orbiting asset perimeter, engage before surveillance data is relayed.',
  },
  {
    id: 'decoy_drone',
    modelClass: 'decoy_drone',
    label: 'Decoy Drone / Radar Simulator',
    category: 'Tactical Deception Bait (Non-Lethal)',
    summary: 'Expendable radar-reflecting decoy lure designed to mimic a larger airframe on radar and bait operators into depleting kinetic CIWS bursts.',
    cues: [
      'Motion Dynamics: Sustained airspeed (20–30 m/s), LOW altitude (20–80m MSL — unlike high-altitude Recon UAVs at 150–400m), perimeter flyby or lure pass rather than direct asset impact dive.',
      'Radar & Doppler: Artificially elevated MEDIUM RCS (~0.05 m²) via round Luneburg radar-reflector ball; lacks multirotor blade flash.',
      'RF Spectrum & FLIR: COMPLETE RF SILENCE (no video or C2 link). On FLIR (2.5X/5X zoom), resolves as a triangle delta-wing carrying a round radar-reflector ball and tail flare.',
      'Effector Action: HOLD FIRE [H] / AMMUNITION CONSERVATION. Classify as Decoy [7] and issue Hold Fire [H]. Engaging a decoy wastes finite gun bursts and incurs an -8 pt decoy bait penalty.',
    ],
    caveat: 'TACTICAL DECEPTION. Distinguish from Recon UAVs (which fly HIGH at 150–400m with LONG RANGE C2 RF) and Fiber FPVs (which have SMALL RCS 0.02 m² and dive directly at the asset). Never waste gun ammo on decoys.',
  },
  {
    id: 'clutter',
    modelClass: 'clutter',
    label: 'Radar Clutter / False Plot',
    category: 'Environmental Artifact (False Plot)',
    summary: 'Transient radar artifact from weather, terrain bounce, or foliage. Low track quality with erratic jitter and zero RF signal.',
    cues: [
      'Motion Dynamics: Near-zero or drifting velocity (0–6 m/s), ground elevation (0–50m), erratic spatial jump without aerodynamic continuity.',
      'Radar & Doppler: Fluctuating micro-RCS (~0.005 m²); low track quality and frequent plot dropouts between antenna sweeps.',
      'RF Spectrum: Zero RF emission; completely absent on electronic surveillance displays.',
      'Effector Action: NO EFFECTOR ACTION. Weapons Safe / Hold Fire. Automatic track correlator will drop plot after repeated missed updates.',
    ],
    caveat: 'DO NOT ENGAGE GHOST TRACKS. Firing kinetic rounds or directing jammers at clutter wastes battery and reveals defender position. Allow track quality score to settle before taking action.',
  },
];

const CONTACT_IMAGE_BY_CLASS: Record<ThreatClassId, string> = {
  bird: '/contact-library/BIRD.png',
  commercial_quad: '/contact-library/CIVILIAN_quad.png',
  fpv_kamikaze: '/contact-library/fpv.png',
  fpv_fiber: '/contact-library/rf_drone.png',
  fixed_wing_recon: '/contact-library/fixed_wingUAV.png',
  decoy_drone: '/contact-library/decoy_profilw.png',
  clutter: '/contact-library/radio_clutter.png',
};

function ContactIllustration({ modelClass }: { modelClass: ThreatClassId }): React.JSX.Element {
  return <img aria-hidden="true" alt="" className="contact-object-art" src={CONTACT_IMAGE_BY_CLASS[modelClass]} />;
}

function RevealText({
  text,
  accentWords = [],
  phase = 0,
}: {
  text: string;
  accentWords?: string[];
  phase?: number;
}): React.JSX.Element {
  let wordIndex = 0;
  const accents = accentWords.flatMap((word) => word.toLowerCase().split(/\s+/));

  return (
    <>
      {text.split(/(\s+)/).map((part, index) => {
        if (/^\s+$/.test(part)) return part;
        const currentIndex = wordIndex++;
        const cleanWord = part.toLowerCase().replace(/[^a-z0-9/-]/g, '');
        const isAccent = accents.some((word) => cleanWord === word || part.toLowerCase().startsWith(word));
        return (
          <span className="contact-word-mask" key={`${index}-${part}`}>
            <span
              className={`contact-reveal-word${isAccent ? ' is-accent' : ''}`}
              style={{
                '--word-delay': `${Math.min(currentIndex * 24 + phase * 110, 1200)}ms`,
                '--word-index': currentIndex,
              } as React.CSSProperties}
            >
              {part}
            </span>
          </span>
        );
      })}
    </>
  );
}

interface ContactReferencePageProps {
  contact: ContactReference;
  onBack: () => void;
}

export function ContactReferencePage({ contact, onBack }: ContactReferencePageProps): React.JSX.Element {
  const scrollRootRef = useRef<HTMLElement | null>(null);
  useLenisScrollRoot(scrollRootRef);
  const [hoveredContact, setHoveredContact] = useState<ContactReference | null>(null);
  const [pinnedContact, setPinnedContact] = useState<ContactReference | null>(contact);
  const hoverResetTimer = useRef<number | null>(null);
  const previewContact = hoveredContact ?? pinnedContact;
  const profile = THREAT_LIBRARY[(previewContact ?? contact).modelClass];
  const titleText = previewContact?.label ?? 'Contact Deck';
  const [titleLayers, setTitleLayers] = useState<{ current: string; outgoing: string | null }>(() => ({ current: titleText, outgoing: null }));
  const [cursorVisible, setCursorVisible] = useState(false);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorTargetRef = useRef({ x: 0, y: 0 });
  const cursorCurrentRef = useRef({ x: 0, y: 0 });
  const activeContactIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPinnedContact(contact);
  }, [contact]);

  useEffect(() => {
    setTitleLayers((layers) => layers.current === titleText
      ? layers
      : { current: titleText, outgoing: layers.current });
    const timeout = window.setTimeout(() => {
      setTitleLayers((layers) => layers.current === titleText ? { ...layers, outgoing: null } : layers);
    }, 560);
    return () => window.clearTimeout(timeout);
  }, [titleText]);

  const updateRailPreview = (event: React.MouseEvent<HTMLElement>): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-contact-id]');
    const id = card?.dataset.contactId;
    if (!id || activeContactIdRef.current === id) return;
    const item = CONTACT_REFERENCES.find((reference) => reference.id === id);
    if (item) {
      activeContactIdRef.current = id;
      setHoveredContact(item);
    }
  };

  const moveHoverCursor = (event: React.MouseEvent<HTMLElement>, snap = false): void => {
    if (typeof window !== 'undefined') {
      const isTouchOrCoarse =
        window.innerWidth <= 768 ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches;
      if (isTouchOrCoarse) {
        if (cursorVisible) setCursorVisible(false);
        return;
      }
    }
    const overCard = (event.target as HTMLElement).closest('[data-contact-id]');
    if (!overCard && !cursorRef.current) return;
    const target = { x: event.clientX, y: event.clientY };
    cursorTargetRef.current = target;
    if (snap || (overCard && !cursorRef.current)) cursorCurrentRef.current = target;
    if (overCard && !cursorRef.current) setCursorVisible(true);
    if (!cursorRef.current || cursorFrameRef.current !== null) return;

    const follow = (): void => {
      const cursor = cursorRef.current;
      if (!cursor) {
        cursorFrameRef.current = null;
        return;
      }
      const current = cursorCurrentRef.current;
      const destination = cursorTargetRef.current;
      current.x += (destination.x - current.x) * 0.68;
      current.y += (destination.y - current.y) * 0.68;
      const remaining = Math.max(Math.abs(destination.x - current.x), Math.abs(destination.y - current.y));
      if (remaining < 0.35) {
        current.x = destination.x;
        current.y = destination.y;
      }
      cursor.style.left = `${current.x}px`;
      cursor.style.top = `${current.y}px`;
      cursorFrameRef.current = remaining < 0.35 ? null : window.requestAnimationFrame(follow);
    };

    cursorFrameRef.current = window.requestAnimationFrame(follow);
  };

  return (
    <main className="contact-reference-page" ref={scrollRootRef}>
      <div className="contact-stair-transition" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            className="contact-stair-transition-panel"
            key={index}
            style={{ '--stair-index': index } as React.CSSProperties}
          />
        ))}
      </div>
      <section
        aria-labelledby="contact-reference-title"
        className="contact-reference-sheet"
        data-lenis-content=""
      >
        <button className="contact-reference-close" type="button" onClick={onBack} aria-label="Back to console">×</button>
        <div
          className="contact-object-experience"
          onMouseLeave={() => {
            hoverResetTimer.current = window.setTimeout(() => setHoveredContact(null), 100);
          }}
        >
        <nav
          className="contact-object-rail"
          aria-label="Contact objects"
          onMouseEnter={(event) => {
            if (hoverResetTimer.current !== null) window.clearTimeout(hoverResetTimer.current);
            updateRailPreview(event);
            moveHoverCursor(event, true);
          }}
          onMouseMove={(event) => {
            updateRailPreview(event);
            moveHoverCursor(event);
          }}
          onMouseLeave={() => {
            activeContactIdRef.current = null;
            setCursorVisible(false);
            setHoveredContact(null);
            if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
            cursorFrameRef.current = null;
          }}
        >
          {CONTACT_REFERENCES.map((item, index) => (
            <a
              aria-current={item.id === contact.id ? 'page' : undefined}
              aria-label={`${item.label} — ${item.category}`}
              className={`contact-object-thumb${item.id === contact.id ? ' is-current' : ''}`}
              data-contact-id={item.id}
              href={`#/contacts/${encodeURIComponent(item.id)}`}
              key={item.id}
              onClick={() => setPinnedContact(item)}
              onFocus={() => {
                if (hoverResetTimer.current !== null) window.clearTimeout(hoverResetTimer.current);
                setHoveredContact(item);
              }}
              onBlur={() => setHoveredContact(null)}
              style={{ '--contact-index': index } as React.CSSProperties}
            >
              <ContactIllustration modelClass={item.modelClass} />
            </a>
          ))}
        </nav>
        {cursorVisible && (
          <div
            aria-hidden="true"
            className="contact-hover-cursor"
            ref={cursorRef}
            style={{ left: cursorCurrentRef.current.x, top: cursorCurrentRef.current.y }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m5 19 8-8-2-2 9-4-4 9-2-2-8 7Z" fill="currentColor" stroke="none" />
            </svg>
          </div>
        )}

        <header className="contact-object-hero">
          {previewContact && (
            <div className="contact-reference-eyebrow contact-object-kicker" key={`category-${previewContact.id}`}>
              VAJRA / CONTACT DECK / {previewContact.category.toUpperCase()}
            </div>
          )}
          <h1 className={`contact-title${previewContact ? '' : ' is-library-title'}`} id="contact-reference-title" aria-label={titleText} aria-live="polite">
            {titleLayers.outgoing && (
              <span aria-hidden="true" className="contact-title-line is-leaving" key={`out-${titleLayers.outgoing}`}>
                {titleLayers.outgoing.toUpperCase()}
              </span>
            )}
            <span aria-hidden="true" className="contact-title-line is-rising" key={`in-${titleLayers.current}`}>
              {titleLayers.current.toUpperCase()}
            </span>
          </h1>
        </header>

        {previewContact?.id === 'bird' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <BirdAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}
        {previewContact?.id === 'commercial_quad' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <CivilianQuadAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}
        {previewContact?.id === 'fpv_kamikaze' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <FpvKamikazeAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}
        {previewContact?.id === 'fpv_fiber' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <FpvFiberAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}
        {previewContact?.id === 'fixed_wing_recon' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <FixedWingAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}
        {previewContact?.id === 'decoy_drone' && (
          <div className="contact-bird-ascii-stage" aria-hidden="true">
            <DecoyDroneAsciiSimulation scrollRootRef={scrollRootRef} />
          </div>
        )}

        {previewContact && (
          <>
            <div className="contact-editorial-copy" key={previewContact.id}>
              <p className="contact-editorial-lede">
                <RevealText text={previewContact.summary} accentWords={['radar', 'RF', 'multirotor', 'return', 'Biological', 'Hostile', 'strike', 'drone', 'clutter', 'immune', 'hard-kill', 'telemetry']} />
              </p>

              <section className="contact-copy-section">
                <div className="contact-copy-label">TACTICAL MOTION & SENSOR RECOGNITION FACTORS</div>
                <div className="contact-copy-cues">
                  {previewContact.cues.map((cue, index) => (
                    <p key={cue}><RevealText text={cue} accentWords={['Motion', 'Dynamics', 'Radar', 'Doppler', 'RF', 'Spectrum', 'Effector', 'Action', 'WEAPONS', 'HOLD', 'SOFT-KILL', 'HARD-KILL', 'DUAL-PHASE', 'track', 'course', 'speed', 'CIWS', 'Jammer', '800m', 'optical', 'lock']} phase={index} /></p>
                  ))}
                </div>
              </section>

              <section className="contact-copy-section contact-copy-caution">
                <div className="contact-copy-label">RULES OF ENGAGEMENT & THREAT DOCTRINE</div>
                <p className="contact-copy-body"><RevealText text={previewContact.caveat} accentWords={['DO NOT ENGAGE', 'COLLATERAL RESTRICTION', 'PRIORITY HOSTILE TARGET', 'EW IMMUNE THREAT', 'STANDOFF THREAT', 'TACTICAL DECEPTION', 'DO NOT ENGAGE GHOST TRACKS', '800m', 'CIWS', 'Jammer', 'ROE', 'not', 'failsafe']} phase={2} /></p>
              </section>

              <section className="contact-copy-section">
                <div className="contact-copy-label">TACTICAL SPECIFICATIONS & KINEMATICS MATRIX</div>
                <p className="contact-copy-intro">Deterministic simulation parameters and baseline sensor benchmarks for this target class.</p>
                <div className="contact-editorial-metrics">
                  <div><span>SPEED ENVELOPE</span><strong><RevealText text={`${profile.speedRangeMps[0]}–${profile.speedRangeMps[1]} m/s (${Math.round(profile.speedRangeMps[0] * 3.6)}–${Math.round(profile.speedRangeMps[1] * 3.6)} km/h)`} phase={1} /></strong></div>
                  <div><span>ALTITUDE ENVELOPE</span><strong><RevealText text={`${profile.altitudeBandM[0]}–${profile.altitudeBandM[1]} m MSL`} phase={2} /></strong></div>
                  <div><span>NOMINAL RADAR RCS</span><strong><RevealText text={`${profile.rcsM2} m²`} phase={3} /></strong></div>
                  <div><span>RF EMISSION SPECTRUM</span><strong><RevealText text={profile.rfSignature === 'none' ? 'NONE (RF SILENT)' : profile.rfSignature.replace(/_/g, ' ').toUpperCase()} accentWords={['telemetry', 'video', 'link', 'none', 'silent']} phase={4} /></strong></div>
                  <div><span>THERMAL EMISSION INDEX</span><strong><RevealText text={`${profile.thermalSignature.toFixed(1)} / 1.0`} phase={5} /></strong></div>
                  <div><span>THREAT CLASSIFICATION</span><strong><RevealText text={profile.hostile ? 'HOSTILE TARGET' : (previewContact.id === 'clutter' ? 'ENVIRONMENTAL ARTIFACT' : 'NEUTRAL / NON-LETHAL')} accentWords={['HOSTILE', 'TARGET']} phase={6} /></strong></div>
                </div>
                <p className="contact-copy-footnote"><RevealText text="Baseline parameters reflect target generation envelopes. Live sensor measurements are subject to distance path-loss, terrain masking, antenna elevation limits, and radar clutter." accentWords={['terrain masking', 'radar clutter']} phase={3} /></p>
              </section>

              <section className="contact-copy-section">
                <div className="contact-copy-label">CONSOLE RADAR INTERPRETATION MANUAL</div>
                <dl className="contact-editorial-guide">
                  <div><dt>SPEED & VECTOR HEADING</dt><dd><RevealText text="Estimated true airspeed and heading. Requires 3 antenna sweeps to stabilize and filter Doppler plot noise." accentWords={['track', 'stable']} /></dd></div>
                  <div><dt>CLOSING RATE (RANGE-RATE)</dt><dd><RevealText text="Direct rate of closure against defended asset: negative indicates inbound attack; positive indicates outbound flight." accentWords={['negative', 'positive']} phase={1} /></dd></div>
                  <div><dt>ALTITUDE (ESTIMATED MSL)</dt><dd><RevealText text="Barometric height above sea level. Targets below 80m AGL exploit terrain masking and contour valleys." accentWords={['MSL', 'terrain']} phase={3} /></dd></div>
                  <div><dt>TURN RATE & ACCELERATION</dt><dd><RevealText text="Heading change per second. Racing multirotors display abrupt >45° course changes; fixed wings display banked turns <15°." accentWords={['course', 'turn']} phase={2} /></dd></div>
                  <div><dt>RCS BUCKET & MICRO-DOPPLER</dt><dd><RevealText text="Return magnitude classification. Micro-Doppler peaks indicate rotating propellers, whereas flat returns indicate fixed-wing or clutter." accentWords={['Micro', 'Small', 'Medium']} phase={4} /></dd></div>
                  <div><dt>RF INTERCEPT & EO/IR LOCK</dt><dd><RevealText text="Signals intelligence detects active video/RC links. EO/IR optical turret provides visual confirmation when line-of-sight permits." accentWords={['RF', 'EO/IR']} phase={5} /></dd></div>
                </dl>
              </section>

              <aside className="contact-copy-field-note">
                <div className="contact-copy-label">TRAINEE DECISION PROCEDURE</div>
                <p><RevealText text="1. Track Assessment: Cross-read closing rate, altitude, and RCS bucket against known profiles. 2. Spectrum & EO/FLIR Correlation: Check RF link strobe and lock EO/IR camera [E] with 2.5X/5X zoom to verify airframe silhouette. 3. Range Verification: Inside 800m, autonomous optical lock renders RF Jammer ineffective—switch immediately to 30mm Kinetic CIWS. 4. ROE & Bait Discipline: Never engage civilian quadcopters, fake decoy lures, radar clutter, or biological birds—issue Hold Fire [H]." accentWords={['800m', 'Kinetic CIWS', 'RF Jammer', 'ROE', 'Hold Fire']} phase={2} /></p>
              </aside>
            </div>
            <button className="contact-reference-done" type="button" onClick={onBack}>BACK TO CONSOLE</button>
          </>
        )}
        </div>
      </section>
    </main>
  );
}
