import React from 'react';
import { ConfusionMatrix as ConfusionData, SkillMatrix, TrendPoint } from './analytics.js';

export interface LineSeries {
  label: string;
  color: string;
  points: TrendPoint[];
}

export function LineChart({ title, series }: { title: string; series: LineSeries[] }): React.JSX.Element {
  const width = 720;
  const height = 270;
  const left = 42;
  const right = 18;
  const top = 24;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  const max = Math.max(100, ...allValues);
  const xFor = (index: number, count: number) => left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const yFor = (value: number) => top + plotHeight - (value / max) * plotHeight;

  return (
    <figure className="aar-chart-card">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <title>{title}</title>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = yFor(tick);
          return <g key={tick}><line x1={left} y1={y} x2={width - right} y2={y} className="aar-gridline" /><text x={left - 8} y={y + 4} textAnchor="end" className="aar-axis-label">{tick}</text></g>;
        })}
        {series.map((item) => {
          const count = item.points.length;
          const path = item.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index, count)} ${yFor(point.value)}`).join(' ');
          return <g key={item.label}>
            <path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {item.points.map((point, index) => <circle key={point.sessionId} cx={xFor(index, count)} cy={yFor(point.value)} r="3.5" fill={item.color}><title>{`${item.label}: ${point.value.toFixed(1)} at ${new Date(point.startedAt).toLocaleDateString()}`}</title></circle>)}
          </g>;
        })}
      </svg>
      <div className="aar-chart-legend">{series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    </figure>
  );
}

function allSkills(matrix: SkillMatrix): Array<[string, { value: number; n: number; trend: string }]> {
  return [
    ['Detection latency', matrix.detection_latency],
    ...Object.entries(matrix.classification).map(([name, value]) => [`Classify ${name.replaceAll('_', ' ')}`, value] as [string, typeof value]),
    ['Engagement latency', matrix.engagement_latency],
    ['Effector fit', matrix.effector_fit],
    ['Fire discipline', matrix.fire_discipline],
    ['Asset defence', matrix.asset_defence],
  ];
}

export function Heatmap({ title, matrix }: { title: string; matrix: SkillMatrix }): React.JSX.Element {
  return (
    <section className="aar-chart-card" aria-label={title}>
      <h3>{title}</h3>
      <div className="aar-heatmap">
        {allSkills(matrix).map(([label, skill]) => <div className="aar-heat-cell" key={label} style={{ background: `rgba(82, 111, 15, ${0.08 + skill.value / 150})` }} title={`${label}: ${skill.value.toFixed(1)} (${skill.n} samples), ${skill.trend}`}>
          <span>{label}</span><strong>{skill.n ? `${skill.value.toFixed(0)}%` : '—'}</strong><small>{skill.trend}</small>
        </div>)}
      </div>
    </section>
  );
}

export function ConfusionMatrixChart({ data }: { data: ConfusionData }): React.JSX.Element {
  const cell = 34;
  const labelWidth = 124;
  const headerHeight = 128;
  const width = labelWidth + data.labels.length * cell + 10;
  const height = headerHeight + data.labels.length * cell + 8;
  const max = Math.max(1, ...data.counts.flat());
  return (
    <section className="aar-chart-card aar-confusion-card" aria-label="Threat classification confusion matrix">
      <h3>Classification confusion matrix</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rows are true classes; columns are assessed classes">
        <title>Confusion matrix. Rows show true classes and columns show assessed classes.</title>
        <text x={labelWidth + (data.labels.length * cell) / 2} y="14" textAnchor="middle" className="aar-matrix-axis">ASSESSED CLASS</text>
        {data.labels.map((label, column) => <text key={`col-${label}`} transform={`translate(${labelWidth + column * cell + 24} ${headerHeight - 4}) rotate(-52)`} className="aar-matrix-label">{label.replaceAll('_', ' ')}</text>)}
        {data.labels.map((label, row) => <g key={`row-${label}`}>
          <text x={labelWidth - 8} y={headerHeight + row * cell + 22} textAnchor="end" className="aar-matrix-label">{label.replaceAll('_', ' ')}</text>
          {data.labels.map((columnLabel, column) => {
            const count = data.counts[row]?.[column] ?? 0;
            const alpha = count === 0 ? 0.025 : 0.12 + (count / max) * 0.7;
            return <g key={`${label}-${columnLabel}`}>
              <rect x={labelWidth + column * cell} y={headerHeight + row * cell} width={cell - 2} height={cell - 2} rx="4" fill={`rgba(82, 111, 15, ${alpha})`} stroke="rgba(45, 40, 35, .12)" />
              <text x={labelWidth + column * cell + (cell - 2) / 2} y={headerHeight + row * cell + 21} textAnchor="middle" className="aar-matrix-count">{count || ''}</text>
            </g>;
          })}
        </g>)}
        <text x="12" y={headerHeight + (data.labels.length * cell) / 2} textAnchor="middle" transform={`rotate(-90 12 ${headerHeight + (data.labels.length * cell) / 2})`} className="aar-matrix-axis">TRUE CLASS</text>
      </svg>
      <p>{data.total} classified contacts</p>
    </section>
  );
}
