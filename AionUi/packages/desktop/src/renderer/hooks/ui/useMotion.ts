import { useCallback, useEffect, useRef } from 'react';

/** Non-blocking, interruptible content motion. React owns the final visual state. */
export const useMotion = () => {
  const animations = useRef(new Map<Element, Animation>());
  const mounted = useRef(true);

  const cancel = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const handlePreference = () => {
      if (preference?.matches) cancel();
    };
    const handleVisibility = () => {
      if (document.hidden) cancel();
    };
    preference?.addEventListener?.('change', handlePreference);
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      mounted.current = false;
      cancel();
      preference?.removeEventListener?.('change', handlePreference);
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [cancel]);

  const animate = useCallback(
    (
      element: Element | null | undefined,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options: KeyframeAnimationOptions = {}
    ): Animation | null => {
      if (!element) return null;
      animations.current.get(element)?.cancel();
      animations.current.delete(element);
      if (
        !mounted.current ||
        !element.isConnected ||
        document.hidden ||
        typeof element.animate !== 'function' ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        return null;
      }
      try {
        const animation = element.animate(keyframes, {
          duration: 320,
          easing: 'cubic-bezier(.22, 1, .36, 1)',
          ...options,
          fill: 'backwards',
        });
        animations.current.set(element, animation);
        const forget = () => {
          if (animations.current.get(element) === animation) animations.current.delete(element);
        };
        animation.addEventListener('finish', forget, { once: true });
        animation.addEventListener('cancel', forget, { once: true });
        return animation;
      } catch {
        // Decorative motion must never interrupt sending, editing, or navigation.
        return null;
      }
    },
    []
  );

  return { animate, cancel };
};
