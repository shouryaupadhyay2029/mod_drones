import Lenis from 'lenis';
import { useEffect } from 'react';

/** Apply Lenis to an existing overflow container and its content element. */
export function useLenisScrollRoot<T extends HTMLElement>(rootRef: { current: T | null }): void {
  useEffect(() => {
    const wrapper = rootRef.current;
    const content = wrapper?.querySelector<HTMLElement>('[data-lenis-content]');
    if (!wrapper || !content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      autoRaf: true,
      lerp: 0.075,
      wheelMultiplier: 0.92,
      smoothWheel: true,
      respectReducedMotion: true,
      prevent: (node) => node.closest('[data-lenis-prevent]') !== null,
    });

    lenis.on('scroll', ({ scroll, progress, velocity }) => {
      wrapper.style.setProperty('--scroll-y', `${scroll.toFixed(1)}px`);
      wrapper.style.setProperty('--scroll-progress', `${progress.toFixed(4)}`);
      wrapper.style.setProperty('--scroll-velocity', `${Math.max(-1, Math.min(1, velocity / 30)).toFixed(3)}`);
    });

    return () => lenis.destroy();
  }, [rootRef]);
}
