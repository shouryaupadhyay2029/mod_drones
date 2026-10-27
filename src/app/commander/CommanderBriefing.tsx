import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CommanderOfficerAscii } from '../components/CommanderOfficerAscii.js';
import { TextRoll } from '../components/TextRoll.js';

export interface CommanderBriefingProps {
  onClose: () => void;
}

const BRIEFING_STEPS: { kicker: string; text: string }[] = [
  {
    kicker: 'WELCOME, COMMANDER',
    text: 'Commander on deck. This is Theatre Command. Unlike the trainee console, you do not pull any triggers here. You decide where our ammo, missiles and permissions go across three defended sites.',
  },
  {
    kicker: 'INTEL BRIEFING',
    text: "S1, S2 and S3 are the sites you defend. 'Value' is how much each one is worth. The threat band shows where intel expects the heaviest attack. Protect high value, high threat sites first.",
  },
  {
    kicker: 'RESOURCE ALLOCATION',
    text: 'The gun and missile pool is shared by all sites. Central Reserve is the share you hold back at HQ to rush to a site later. Allocation weight gives a site a bigger slice of what is left.',
  },
  {
    kicker: 'RULES OF ENGAGEMENT',
    text: 'Tight means fire only when sure. Standard is balanced. Free means shoot anything hostile-looking, fast, but you may waste ammo or hit civilian traffic.',
  },
  {
    kicker: 'MISSILE AUTHORITY',
    text: 'Hold means no missiles at all. Asset threat means only when the site itself is about to be hit. Free means any hostile. Missiles are expensive, so cheap drones do not deserve them.',
  },
  {
    kicker: 'COMMS LINKS',
    text: "Once the raid starts, watch each site's link. Nominal is live. Degraded delays your orders. Offline cuts the site off and your orders are dropped, so set ROE and ammo BEFORE the link fails.",
  },
  {
    kicker: 'READY',
    text: 'That is the briefing. Plan carefully, then press Launch Raid when you are ready. Good luck, Commander.',
  },
];

const OFFICER_HEIGHT_PX = 612;
const INTRO_MS = 2300; // dim (700) + officer rise + first bubble before typing starts

export function CommanderBriefing({ onClose }: CommanderBriefingProps): React.JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<'entering' | 'active' | 'leaving'>('entering');
  const [introDone, setIntroDone] = useState(false);
  const [scale, setScale] = useState(1);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const leavingRef = useRef(false);

  const step = BRIEFING_STEPS[stepIndex]!;
  const isTyping = introDone && typed < step.text.length;

  const finish = useCallback((): void => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setPhase('leaving');
    window.setTimeout(onClose, 700);
  }, [onClose]);

  const advance = useCallback((): void => {
    if (!introDone || leavingRef.current) return;
    if (typed < step.text.length) {
      setTyped(step.text.length);
    } else if (stepIndex < BRIEFING_STEPS.length - 1) {
      setTyped(0);
      setStepIndex((s) => s + 1);
    } else {
      finish();
    }
  }, [introDone, typed, step.text.length, stepIndex, finish]);

  // Intro timeline + scroll lock
  useEffect(() => {
    const activeTimer = window.setTimeout(() => setPhase('active'), 700);
    const introTimer = window.setTimeout(() => setIntroDone(true), INTRO_MS);

    const blockScroll = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    const el = overlayRef.current;
    if (el) {
      el.addEventListener('wheel', blockScroll, { passive: false });
      el.addEventListener('touchmove', blockScroll, { passive: false });
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(activeTimer);
      window.clearTimeout(introTimer);
      document.body.style.overflow = previousOverflow;
      if (el) {
        el.removeEventListener('wheel', blockScroll);
        el.removeEventListener('touchmove', blockScroll);
      }
    };
  }, []);

  // Responsive officer scale
  useEffect(() => {
    const onResize = (): void => {
      setScale(Math.min(1, (window.innerHeight * 0.82) / OFFICER_HEIGHT_PX));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Typewriter (one interval per step)
  useEffect(() => {
    if (!introDone) return undefined;
    const length = step.text.length;
    const timer = window.setInterval(() => {
      setTyped((t) => (t < length ? t + 1 : t));
    }, 22);
    return () => window.clearInterval(timer);
  }, [introDone, stepIndex, step.text.length]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      } else if (e.key === 'Escape') {
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, finish]);

  const isLast = stepIndex === BRIEFING_STEPS.length - 1;

  return (
    <div
      className={`cmd-brief cmd-brief-${phase}`}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Commander briefing"
    >
      <div className="cmd-brief-dim" aria-hidden="true" />
      <div className="cmd-brief-grain" aria-hidden="true" />

      <div
        className="cmd-brief-officer"
        aria-hidden="true"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom left' }}
      >
        <div className="cmd-brief-rise">
          <CommanderOfficerAscii
            speaking={isTyping}
            style={{ color: '#f1e9db', textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)' }}
          />
        </div>
      </div>

      <div className={`cmd-brief-card${stepIndex === 0 ? ' is-first' : ''}`} key={stepIndex}>
        {/* Minimal Editorial Header */}
        <div className="cmd-brief-header">
          <span className="cmd-brief-kicker">THEATRE BRIEFING</span>
          <span className="cmd-brief-counter">
            {String(stepIndex + 1).padStart(2, '0')}&thinsp;—&thinsp;{String(BRIEFING_STEPS.length).padStart(2, '0')}
          </span>
        </div>

        {/* Title */}
        <h2 className="cmd-brief-title">{step.kicker}</h2>

        {/* Prose */}
        <p className="cmd-brief-text" aria-label={step.text}>
          <span aria-hidden="true">{step.text.slice(0, typed)}</span>
          <i className="cmd-brief-caret" aria-hidden="true" />
        </p>

        {/* Hairline Progress Rule */}
        <div className="cmd-brief-rule" aria-hidden="true">
          <div
            className="cmd-brief-rule-fill"
            style={{ width: `${((stepIndex + 1) / BRIEFING_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Footer Actions */}
        <div className="cmd-brief-actions">
          <button type="button" className="cmd-brief-skip" onClick={finish}>
            Skip briefing
          </button>
          <button type="button" className="cmd-brief-next" onClick={advance}>
            <TextRoll center stagger={0.015}>
              {isLast ? 'Begin Planning' : 'Continue'}
            </TextRoll>
            <span className="cmd-brief-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
