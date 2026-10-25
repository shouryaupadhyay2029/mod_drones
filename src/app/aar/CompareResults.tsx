import React from 'react';
import { compareSessions } from '../../sim/index.js';
import { SessionRecord } from '../storage/db.js';

function formatClass(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CompareResults({ original, fork }: { original: SessionRecord; fork: SessionRecord }): React.JSX.Element {
  const comparison = compareSessions(original.report, fork.report);
  return <>
    <div className="aar-compare-pair">
      <section className="aar-card"><span className="aar-kpi-label">ORIGINAL · {original.id.slice(0, 8)}</span><strong className="aar-kpi-value">{original.summary.total} · {original.summary.grade}</strong><div className="aar-compare-subscores">{Object.entries(original.report.subscores).map(([name, value]) => <span key={name}>{formatClass(name)} <b>{value}</b></span>)}</div></section>
      <section className="aar-card"><span className="aar-kpi-label">FORK · {fork.id.slice(0, 8)}</span><strong className="aar-kpi-value">{fork.summary.total} · {fork.summary.grade}</strong><div className="aar-compare-subscores">{Object.entries(fork.report.subscores).map(([name, value]) => <span key={name}>{formatClass(name)} <b>{value}</b></span>)}</div></section>
    </div>
    <section className="aar-card"><h2>Comparison · {comparison.totalDelta >= 0 ? '+' : ''}{comparison.totalDelta} points · Grade {comparison.gradeChange}</h2>
      <div className="aar-table-wrap"><table className="aar-table"><thead><tr><th>Contact</th><th>Outcome · original / fork</th><th>Classification · original / fork</th><th>Engagement · original / fork</th></tr></thead><tbody>{comparison.perContact.map((contact) => <tr key={contact.actorId}><td>{formatClass(contact.classId)} · T{contact.actorId}</td><td>{contact.outcomeA} / {contact.outcomeB}</td><td>{contact.classificationA} / {contact.classificationB}</td><td>{contact.engagementA} / {contact.engagementB}</td></tr>)}</tbody></table></div>
    </section>
    <div className="aar-compare-pair aar-compare-details">
      <section className="aar-card"><h2>Original penalties</h2>{original.report.penalties.length ? original.report.penalties.map((penalty, index) => <p className="aar-alert" key={`${penalty.reason}-${index}`}>{penalty.reason}</p>) : <p className="aar-muted">No penalties.</p>}</section>
      <section className="aar-card"><h2>Fork penalties</h2>{fork.report.penalties.length ? fork.report.penalties.map((penalty, index) => <p className="aar-alert" key={`${penalty.reason}-${index}`}>{penalty.reason}</p>) : <p className="aar-muted">No penalties.</p>}</section>
    </div>
    <section className="aar-card aar-compare-narrative"><h2>What changed</h2>{comparison.narrative.map((line) => <p key={line}>{line}</p>)}</section>
  </>;
}
