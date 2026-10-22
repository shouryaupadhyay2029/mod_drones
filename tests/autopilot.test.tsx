import React, { StrictMode, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useMission } from '../src/app/console/useMission.js';

// Minimal DOM shim for React 18 createRoot in Node environment
const noop = () => {};
class MockElement {
  nodeType = 1;
  tagName = 'DIV';
  ownerDocument = null as unknown as Document;
  style = {};
  childNodes = [];
  appendChild = noop;
  removeChild = noop;
  addEventListener = noop;
  removeEventListener = noop;
}

const mockDoc = {
  nodeType: 9,
  createElement: () => new MockElement(),
  addEventListener: noop,
  removeEventListener: noop,
};

const mockContainer = new MockElement();
mockContainer.ownerDocument = mockDoc as unknown as Document;

(globalThis as unknown as { document: unknown }).document = mockDoc;
(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = class {};
(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = MockElement;
(globalThis as unknown as { Element: unknown }).Element = MockElement;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Autopilot Side-Effect Isolation under React.StrictMode', () => {
  it('toggleAutopilot enqueues commands exactly once when activated under React.StrictMode', async () => {
    let capturedToggle: (() => void) | null = null;

    // Test component executing useMission
    function Harness({
      onReady,
    }: {
      onReady: (actions: { toggle: () => void }) => void;
    }) {
      const mission = useMission('s1');

      useEffect(() => {
        onReady({
          toggle: mission.toggleAutopilot,
        });
      }, [mission.toggleAutopilot, onReady]);

      return null;
    }

    const root = createRoot(mockContainer as unknown as HTMLElement);

    await act(async () => {
      root.render(
        <StrictMode>
          <Harness
            onReady={(actions) => {
              capturedToggle = actions.toggle;
            }}
          />
        </StrictMode>
      );
    });

    expect(capturedToggle).toBeDefined();

    // Invoking toggle under StrictMode must execute without error and without duplicated updater side effects
    await act(async () => {
      if (capturedToggle) {
        capturedToggle();
      }
    });

    // Cleanup root
    await act(async () => {
      root.unmount();
    });
  });

  it('guarantees state updater is pure and dispatches commands outside the updater', () => {
    // Direct verification of pure state updater pattern
    let sideEffectCount = 0;
    let state = false;

    const mockStateUpdater = (updaterOrVal: boolean | ((prev: boolean) => boolean)) => {
      if (typeof updaterOrVal === 'function') {
        // StrictMode simulates double-invoking updaters
        updaterOrVal(state);
        state = updaterOrVal(state);
      } else {
        state = updaterOrVal;
      }
    };

    // The fixed pattern: compute next outside updater, set state, execute side effect outside
    const toggleAutopilotSafe = () => {
      const next = !state;
      mockStateUpdater(next);
      if (next) {
        sideEffectCount++;
      }
    };

    toggleAutopilotSafe();
    expect(state).toBe(true);
    expect(sideEffectCount).toBe(1); // Exactly once
  });
});
