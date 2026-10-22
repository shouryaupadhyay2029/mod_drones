import React from 'react';

export interface TextRollProps {
  children: string;
  className?: string;
  style?: React.CSSProperties;
  center?: boolean;
  stagger?: number;
  duration?: number;
}

const DEFAULT_STAGGER = 0.035;
const DEFAULT_DURATION = 0.28;

export function TextRoll({
  children,
  className = '',
  style,
  center = false,
  stagger = DEFAULT_STAGGER,
  duration = DEFAULT_DURATION,
}: TextRollProps): React.JSX.Element {
  const chars = children.split('');
  const len = chars.length;

  return (
    <span
      className={`text-roll-container ${className}`}
      data-text-roll={children}
      style={{
        position: 'relative',
        display: 'inline-flex',
        overflow: 'hidden',
        lineHeight: 1,
        verticalAlign: 'baseline',
        ...style,
      }}
    >
      {/* Accessible contiguous text for screen readers & text-match queries */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {children}
      </span>

      {/* Primary visible characters (slide up on hover) */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          whiteSpace: 'pre',
        }}
      >
        {chars.map((char, i) => {
          const delay = center
            ? stagger * Math.abs(i - (len - 1) / 2)
            : stagger * i;

          return (
            <span
              key={i}
              className="text-roll-char-top"
              style={{
                display: 'inline-block',
                transform: 'translateY(0%)',
                transition: `transform ${duration}s cubic-bezier(0.4, 0, 0.2, 1) ${delay.toFixed(3)}s`,
                whiteSpace: 'pre',
              }}
            >
              {char}
            </span>
          );
        })}
      </span>

      {/* Duplicate characters (slide in from below on hover) */}
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'inline-flex',
          whiteSpace: 'pre',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        {chars.map((char, i) => {
          const delay = center
            ? stagger * Math.abs(i - (len - 1) / 2)
            : stagger * i;

          return (
            <span
              key={i}
              className="text-roll-char-bottom"
              style={{
                display: 'inline-block',
                transform: 'translateY(100%)',
                transition: `transform ${duration}s cubic-bezier(0.4, 0, 0.2, 1) ${delay.toFixed(3)}s`,
                whiteSpace: 'pre',
              }}
            >
              {char}
            </span>
          );
        })}
      </span>
    </span>
  );
}
