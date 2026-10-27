import React, { useMemo, useRef, useState } from 'react';
import { CommanderCommand, CommanderSession, RaidPlan, commanderReport } from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';
import { useLenisScrollRoot } from '../hooks/useLenisScrollRoot.js';
import { saveSetting } from '../storage/db.js';
import '../aar/aar.css';
import { CommanderSetup } from './CommanderSetup.js';
import { CommanderConsole } from './CommanderConsole.js';
import { CommanderDebrief } from './CommanderDebrief.js';
import './commander.css';

export function CommanderSplitTitle({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span className="vj-char-mask" key={`${i}-${ch}`}>
          <span
            className="vj-split-char"
            style={{ '--char-index': i } as React.CSSProperties}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        </span>
      ))}
    </>
  );
}

export function CommanderRevealWords({
  text,
  accentWords = [],
  baseIndex = 0,
}: {
  text: string;
  accentWords?: string[];
  baseIndex?: number;
}): React.JSX.Element {
  let wordIdx = 0;
  const accents = accentWords.map((w) => w.toLowerCase());

  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        const currentWordIndex = baseIndex + wordIdx++;
        const cleaned = part.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const isAccent = accents.some((w) => cleaned === w || cleaned.startsWith(w));
        return (
          <span className="vj-word-mask" key={`${i}-${part}`}>
            <span
              className={`vj-reveal-word${isAccent ? ' is-accent' : ''}`}
              style={{ '--word-index': currentWordIndex } as React.CSSProperties}
            >
              {part}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function CommanderPage(): React.JSX.Element {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  useLenisScrollRoot(scrollRootRef);

  const [session, setSession] = useState<CommanderSession | null>(null);
  const [raid, setRaid] = useState<RaidPlan | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [, setRevision] = useState(0);
  const report = useMemo(() => (session?.isComplete() ? commanderReport(session) : null), [session, session?.tick]);

  const start = (plan: RaidPlan, commands: CommanderCommand[], useAutopilot: boolean): void => {
    const active = new CommanderSession(plan);
    active.step(commands);
    setRaid(plan);
    setAutopilot(useAutopilot);
    setSession(active);
    setRevision((v) => v + 1);
  };

  const finish = (): void => {
    if (!session || !raid) return;
    const score = commanderReport(session);
    void saveSetting({
      key: `commander-session:${raid.id}`,
      value: {
        mode: 'commander',
        raid,
        report: score,
        log: session.getSessionLog(),
        completedAt: Date.now(),
      },
    });
    setRevision((v) => v + 1);
  };

  return (
    <div className="commander-scroll-root" ref={scrollRootRef} data-scroll-root="">
      <div className="vj-stair-transition" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            className="vj-stair-panel"
            key={i}
            style={{ '--stair-index': i } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="commander-shell" data-lenis-content="">
        <CommanderNav />
        {!session || !raid ? (
          <CommanderSetup onLaunch={start} />
        ) : report ? (
          <CommanderDebrief report={report} raid={raid} log={session.getSessionLog()} />
        ) : (
          <CommanderConsole
            session={session}
            autopilot={autopilot}
            onAutopilotChange={setAutopilot}
            onComplete={finish}
          />
        )}
      </div>
    </div>
  );
}

function CommanderNav(): React.JSX.Element {
  return (
    <nav className="commander-nav">
      <a className="commander-brand" href="#/">
        <img src="/vajra-emblem.png" alt="" /> VAJRA <span className="commander-nav-sep">/</span> COMMANDER CONSOLE
      </a>
      <a className="commander-return-btn" href="#/">
        <TextRoll center stagger={0.015}>RETURN TO TRAINEE CONSOLE ↗</TextRoll>
      </a>
    </nav>
  );
}
