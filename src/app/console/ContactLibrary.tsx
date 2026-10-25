import React, { useEffect, useRef, useState } from 'react';
import { THREAT_LIBRARY, ThreatClassId } from '../../sim/index.js';
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
    label: 'Bird',
    category: 'Biological contact',
    summary: 'A small airborne return whose path may vary as it flaps, turns, or drifts with the wind.',
    cues: ['Often a weak or fluctuating radar return', 'May show irregular changes in course or speed', 'No associated control-link signal is expected'],
    caveat: 'A weak return or absent RF cue does not prove a contact is a bird. Wait for a stable track and compare several observations.',
  },
  {
    id: 'commercial_quad',
    modelClass: 'commercial_quad',
    label: 'Civilian quadcopter',
    category: 'Multirotor aircraft',
    summary: 'A small multirotor used for photography, inspection, recreation, or other civilian tasks.',
    cues: ['May move slowly, hover, or change direction frequently', 'Can produce a small radar return', 'A telemetry signal may be present, absent, or difficult to associate'],
    caveat: 'These cues describe movement and sensors, not intent. A civilian-looking profile cannot establish whether an activity is authorized.',
  },
  {
    id: 'fpv_kamikaze',
    modelClass: 'fpv_kamikaze',
    label: 'Radio-linked FPV type',
    category: 'Small multirotor profile',
    summary: 'A fast, manually piloted multirotor profile represented in the simulator. Its radar appearance can overlap with other small aircraft.',
    cues: ['May show sustained movement with abrupt course changes', 'Often represented by a small radar return', 'A video or control-link cue may appear, but can be noisy or unassociated'],
    caveat: 'No single speed, turn, or RF observation identifies intent. Treat the class as an assessment with uncertainty, not a confirmed identity.',
  },
  {
    id: 'fpv_fiber',
    modelClass: 'fpv_fiber',
    label: 'RF-silent FPV type',
    category: 'Small multirotor profile',
    summary: 'A simulator class with a flight profile similar to other small multirotors and no modeled radio emission.',
    cues: ['Radar motion can resemble other small multirotor contacts', 'No RF line may be associated with the track', 'EO/IR or continued track history may add context'],
    caveat: 'RF silence alone cannot distinguish this class from a bird, a non-emitting aircraft, poor reception, or a sensor gap.',
  },
  {
    id: 'fixed_wing_recon',
    modelClass: 'fixed_wing_recon',
    label: 'Fixed-wing UAV',
    category: 'Fixed-wing aircraft',
    summary: 'A powered aircraft profile that tends to maintain forward flight rather than hover.',
    cues: ['Usually follows a more continuous course than a hovering multirotor', 'May present a steadier return over repeated radar updates', 'A control or telemetry cue may be available but is not guaranteed'],
    caveat: 'A steady track does not by itself identify aircraft type or purpose. Compare the full track history and available independent sensor cues.',
  },
  {
    id: 'decoy_drone',
    modelClass: 'decoy_drone',
    label: 'Decoy profile',
    category: 'Simulator training class',
    summary: 'A synthetic training contact designed to overlap with other aircraft cues and test whether the trainee avoids overconfidence.',
    cues: ['May have a return that differs from a very small multirotor', 'Can move in a way that resembles an aircraft', 'May have no associated RF signal in the simulation'],
    caveat: 'There is no universal “decoy signature.” In this simulator, use the class only when the accumulated evidence supports it; otherwise retain uncertainty.',
  },
  {
    id: 'clutter',
    modelClass: 'clutter',
    label: 'Radar clutter / false plot',
    category: 'Radar artifact',
    summary: 'A weak or transient radar plot may come from clutter, interference, a brief detection, or a real object.',
    cues: ['May appear briefly or fail to form a consistent track', 'Position or motion estimates can fluctuate', 'Independent confirmation may be unavailable'],
    caveat: 'A short-lived plot is not automatically clutter. Allow the track to develop and preserve an unknown assessment when evidence is insufficient.',
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
        const isAccent = accents.some((word) => part.toLowerCase().startsWith(word));
        const shade = 88 - (currentIndex % 5) * 5;
        return (
          <span
            className={`contact-reveal-word${isAccent ? ' is-accent' : ''}`}
            key={`${index}-${part}`}
            style={{
              '--word-delay': `${Math.min(currentIndex * 20 + phase * 105, 1150)}ms`,
              '--pill-tone': `hsl(0 0% ${shade}%)`,
            } as React.CSSProperties}
          >
            {part}
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
  const [hoveredContact, setHoveredContact] = useState<ContactReference | null>(null);
  const [pinnedContact, setPinnedContact] = useState<ContactReference | null>(null);
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
    <main className="contact-reference-page">
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

        {previewContact && (
          <>
            <div className="contact-editorial-copy" key={previewContact.id}>
              <p className="contact-editorial-lede">
                <RevealText text={previewContact.summary} accentWords={['radar', 'RF', 'multirotor', 'return']} />
              </p>

              <section className="contact-copy-section">
                <div className="contact-copy-label">WHAT THE TRAINEE MAY OBSERVE</div>
                <div className="contact-copy-cues">
                  {previewContact.cues.map((cue, index) => (
                    <p key={cue}><RevealText text={cue} accentWords={['radar', 'RF', 'track', 'course', 'speed']} phase={index} /></p>
                  ))}
                </div>
              </section>

              <section className="contact-copy-section contact-copy-caution">
                <div className="contact-copy-label">KEEP THE ASSESSMENT CAUTIOUS</div>
                <p className="contact-copy-body"><RevealText text={previewContact.caveat} accentWords={['not', 'uncertainty', 'evidence', 'intent']} phase={2} /></p>
              </section>

              <section className="contact-copy-section">
                <div className="contact-copy-label">SIMULATOR MODEL PROFILE / SIM DATA</div>
                <p className="contact-copy-intro">Configured signature for this class in the current training model.</p>
                <div className="contact-editorial-metrics">
                  <div><span>SPEED BAND</span><strong><RevealText text={`${profile.speedRangeMps[0]}–${profile.speedRangeMps[1]} m/s`} phase={1} /></strong></div>
                  <div><span>ALTITUDE BAND</span><strong><RevealText text={`${profile.altitudeBandM[0]}–${profile.altitudeBandM[1]} m MSL`} phase={2} /></strong></div>
                  <div><span>NOMINAL RCS</span><strong><RevealText text={`${profile.rcsM2} m²`} phase={3} /></strong></div>
                  <div><span>RF SIGNATURE</span><strong><RevealText text={profile.rfSignature.replace(/_/g, ' ')} accentWords={['telemetry', 'video', 'link']} phase={4} /></strong></div>
                  <div><span>THERMAL INDEX</span><strong><RevealText text={`${profile.thermalSignature.toFixed(1)} / 1.0`} phase={5} /></strong></div>
                  <div><span>MODELED RF CONTROL</span><strong><RevealText text={profile.rfControlled ? 'Yes' : 'No'} phase={6} /></strong></div>
                </div>
                <p className="contact-copy-footnote"><RevealText text="These are class-generation parameters, not guaranteed live readings. The console reports estimated motion and an RCS bucket; radar noise, terrain, range, and environment can shift or obscure those observations." accentWords={['not', 'radar noise']} phase={3} /></p>
              </section>

              <section className="contact-copy-section">
                <div className="contact-copy-label">CONSOLE FIELD GUIDE</div>
                <dl className="contact-editorial-guide">
                  <div><dt>SPEED / COURSE</dt><dd><RevealText text="Estimated motion magnitude and direction of travel. Values are withheld until the track has enough plots for a stable velocity estimate." accentWords={['track', 'stable']} /></dd></div>
                  <div><dt>CLOSING RATE</dt><dd><RevealText text="Range-rate relative to the defended asset: negative means range is decreasing; positive means it is increasing." accentWords={['negative', 'positive']} phase={1} /></dd></div>
                  <div><dt>TURN RATE</dt><dd><RevealText text="Change in estimated course over time. Read it across several updates because smoothing and plot noise can distort a single value." accentWords={['course', 'plot noise']} phase={2} /></dd></div>
                  <div><dt>ALTITUDE</dt><dd><RevealText text="Estimated height in metres above mean sea level (MSL), not height above the local terrain." accentWords={['MSL', 'not']} phase={3} /></dd></div>
                  <div><dt>RCS BUCKET / QUALITY</dt><dd><RevealText text="RCS is reported as a broad return-size bucket. Track quality summarizes continuity and measurement quality; it is not an identity probability." accentWords={['track quality', 'not']} phase={4} /></dd></div>
                  <div><dt>RF / EO-IR</dt><dd><RevealText text="RF status describes whether a line or signature was associated with the track. EO/IR may provide a broad visual hint when the turret is locked and conditions permit." accentWords={['RF', 'EO/IR']} phase={5} /></dd></div>
                </dl>
              </section>

              <aside className="contact-copy-field-note">
                <div className="contact-copy-label">READING A TRACK</div>
                <p><RevealText text="Compare a stable track history with the modeled profile, then cross-check available sensors. A matching parameter is only one piece of evidence; conflicting or incomplete evidence should remain uncertain. These profiles are generic simulator data, not real-world aircraft specifications." accentWords={['stable track', 'evidence', 'uncertain']} phase={2} /></p>
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
