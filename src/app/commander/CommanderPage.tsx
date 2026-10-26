import React, { useMemo, useState } from 'react';
import { CommanderCommand, CommanderSession, RaidPlan, commanderReport } from '../../sim/index.js';
import { saveSetting } from '../storage/db.js';
import { CommanderSetup } from './CommanderSetup.js';
import { CommanderConsole } from './CommanderConsole.js';
import { CommanderDebrief } from './CommanderDebrief.js';
import './commander.css';

export function CommanderPage(): React.JSX.Element {
  const [session, setSession] = useState<CommanderSession | null>(null);
  const [raid, setRaid] = useState<RaidPlan | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [, setRevision] = useState(0);
  const report = useMemo(() => session?.isComplete() ? commanderReport(session) : null, [session, session?.tick]);
  const start = (plan: RaidPlan, commands: CommanderCommand[], useAutopilot: boolean): void => {
    const active = new CommanderSession(plan);
    active.step(commands);
    setRaid(plan); setAutopilot(useAutopilot); setSession(active); setRevision((v) => v + 1);
  };
  const finish = (): void => {
    if (!session || !raid) return;
    const score = commanderReport(session);
    void saveSetting({ key: `commander-session:${raid.id}`, value: { mode: 'commander', raid, report: score, log: session.getSessionLog(), completedAt: Date.now() } });
    setRevision((v) => v + 1);
  };
  if (!session || !raid) return <><CommanderNav /><CommanderSetup onLaunch={start} /></>;
  if (report) return <><CommanderNav /><CommanderDebrief report={report} raid={raid} log={session.getSessionLog()} /></>;
  return <><CommanderNav /><CommanderConsole session={session} autopilot={autopilot} onAutopilotChange={setAutopilot} onComplete={finish} /></>;
}

function CommanderNav(): React.JSX.Element { return <nav className="commander-nav"><a href="#/">VAJRA</a><span>COMMANDER CONSOLE</span><a href="#/">RETURN TO TRAINEE CONSOLE</a></nav>; }
