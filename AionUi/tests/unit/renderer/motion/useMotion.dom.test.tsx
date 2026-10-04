import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMotion } from '@/renderer/hooks/ui/useMotion';

const animation = () => Object.assign(new EventTarget(), { cancel: vi.fn() }) as unknown as Animation;
const originalMatchMedia = window.matchMedia;
let element: HTMLDivElement;

const setup = (reduced = false) => {
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  window.matchMedia = vi.fn(() => preference as unknown as MediaQueryList);
  element = document.createElement('div');
  document.body.append(element);
  const run = animation();
  element.animate = vi.fn(() => run);
  return { preference, run, ...renderHook(useMotion) };
};

afterEach(() => {
  cleanup();
  element?.remove();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('interruptible content motion', () => {
  it('skips animation when reduced motion is requested', () => {
    const { result } = setup(true);
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    expect(element.animate).not.toHaveBeenCalled();
  });
  it('cancels the previous motion instead of stacking transforms', () => {
    const { result, run } = setup();
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    result.current.animate(element, [{ opacity: 0.5 }, { opacity: 1 }]);
    expect(run.cancel).toHaveBeenCalledOnce();
  });
  it('cancels pending motion immediately when the preference changes', () => {
    const { result, run, preference } = setup();
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    act(() => {
      preference.matches = true;
      preference.dispatchEvent(new Event('change'));
    });
    expect(run.cancel).toHaveBeenCalledOnce();
  });
  it('cleans up motion on page exit and on unmount', () => {
    const { result, run, unmount } = setup();
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(run.cancel).toHaveBeenCalledOnce();
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    unmount();
    expect(run.cancel).toHaveBeenCalledTimes(2);
  });
  it('does not retain finished animations', () => {
    const { result, run, unmount } = setup();
    result.current.animate(element, [{ opacity: 0 }, { opacity: 1 }]);
    run.dispatchEvent(new Event('finish'));
    unmount();
    expect(run.cancel).not.toHaveBeenCalled();
  });
  it('keeps decorative failures from blocking a user action', () => {
    const { result } = setup();
    element.animate = vi.fn(() => {
      throw new Error('unsupported keyframe');
    });
    expect(result.current.animate(element, [{ opacity: 1 }])).toBeNull();
    element.remove();
    expect(result.current.animate(element, [{ opacity: 1 }])).toBeNull();
  });
});
